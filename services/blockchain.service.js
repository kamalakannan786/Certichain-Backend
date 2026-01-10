const { ethers } = require('ethers');
const contractABI = require('../config/contractABI.json');

class BlockchainService {
  constructor() {
    this.provider = null;
    this.contract = null;
    this.signer = null;
    this.initialize();
  }

  async initialize() {
    try {
      // Skip blockchain initialization if no private key
      if (!process.env.BLOCKCHAIN_PRIVATE_KEY || process.env.BLOCKCHAIN_PRIVATE_KEY === 'your_private_key_without_0x_prefix') {
        console.log('Blockchain service initialized in mock mode (no private key)');
        return;
      }

      this.provider = new ethers.providers.JsonRpcProvider(
        process.env.BLOCKCHAIN_RPC_URL || 'https://polygon-mumbai.infura.io/v3/' + process.env.INFURA_PROJECT_ID
      );

      if (process.env.BLOCKCHAIN_PRIVATE_KEY) {
        this.signer = new ethers.Wallet(process.env.BLOCKCHAIN_PRIVATE_KEY, this.provider);
      }

      if (process.env.CONTRACT_ADDRESS && this.signer) {
        this.contract = new ethers.Contract(
          process.env.CONTRACT_ADDRESS,
          contractABI,
          this.signer
        );
        console.log('Blockchain service initialized with contract');
      } else {
        console.log('Blockchain service initialized without contract (deploy contract first)');
      }
    } catch (error) {
      console.error('Blockchain service initialization failed:', error.message);
      console.log('Running in mock blockchain mode');
    }
  }

  async mintCertificate(walletAddress, certificateData, certificateHash) {
    try {
      if (!this.contract) {
        // Return mock data for development
        return {
          tokenId: Math.floor(Math.random() * 10000),
          transactionHash: '0x' + Math.random().toString(16).substring(2, 66),
          blockNumber: Math.floor(Math.random() * 1000000),
          gasUsed: '21000'
        };
      }

      const { studentName, degree, institution, year } = certificateData;

      // Call smart contract mint function
      const tx = await this.contract.mintCertificate(
        walletAddress,
        studentName,
        degree,
        institution,
        year,
        certificateHash
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      // Extract token ID from events
      const mintEvent = receipt.events?.find(e => e.event === 'CertificateIssued');
      const tokenId = mintEvent?.args?.tokenId?.toNumber();

      return {
        tokenId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      console.error('Certificate minting failed:', error);
      throw new Error(`Minting failed: ${error.message}`);
    }
  }

  async verifyCertificate(tokenId) {
    try {
      if (!this.contract) {
        // Return mock verification for development
        return {
          studentName: 'Mock Student',
          degree: 'Mock Degree',
          institution: 'Mock Institution',
          year: 2024,
          certificateHash: 'mock_hash',
          timestamp: new Date(),
          isValid: true,
          owner: '0x0000000000000000000000000000000000000000'
        };
      }

      const result = await this.contract.verifyCertificate(tokenId);
      
      return {
        studentName: result.studentName,
        degree: result.degree,
        institution: result.institution,
        year: result.year.toNumber(),
        certificateHash: result.certificateHash,
        timestamp: new Date(result.timestamp.toNumber() * 1000),
        isValid: result.isValid,
        owner: result.owner
      };
    } catch (error) {
      console.error('Certificate verification failed:', error);
      throw new Error(`Verification failed: ${error.message}`);
    }
  }

  async verifyCertificateByHash(certificateHash) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const result = await this.contract.verifyCertificateByHash(certificateHash);
      
      return {
        tokenId: result.tokenId.toNumber(),
        studentName: result.studentName,
        degree: result.degree,
        institution: result.institution,
        year: result.year.toNumber(),
        isValid: result.isValid
      };
    } catch (error) {
      console.error('Hash verification failed:', error);
      throw new Error(`Hash verification failed: ${error.message}`);
    }
  }

  async revokeCertificate(tokenId) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const tx = await this.contract.revokeCertificate(tokenId);
      const receipt = await tx.wait();

      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      console.error('Certificate revocation failed:', error);
      throw new Error(`Revocation failed: ${error.message}`);
    }
  }

  async getTotalCertificates() {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const total = await this.contract.getTotalCertificates();
      return total.toNumber();
    } catch (error) {
      console.error('Failed to get total certificates:', error);
      return 0;
    }
  }

  async addAuthorizedIssuer(issuerAddress) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const tx = await this.contract.addAuthorizedIssuer(issuerAddress);
      const receipt = await tx.wait();

      return {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      console.error('Failed to add authorized issuer:', error);
      throw new Error(`Authorization failed: ${error.message}`);
    }
  }

  // Get blockchain network info
  async getNetworkInfo() {
    try {
      if (!this.provider) {
        throw new Error('Provider not initialized');
      }

      const network = await this.provider.getNetwork();
      const blockNumber = await this.provider.getBlockNumber();

      return {
        chainId: network.chainId,
        name: network.name,
        currentBlock: blockNumber
      };
    } catch (error) {
      console.error('Failed to get network info:', error);
      return null;
    }
  }

  // Check if address is authorized issuer
  async isAuthorizedIssuer(address) {
    try {
      if (!this.contract) {
        return false;
      }

      return await this.contract.authorizedIssuers(address);
    } catch (error) {
      console.error('Failed to check authorization:', error);
      return false;
    }
  }
}

module.exports = new BlockchainService();