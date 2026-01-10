class RoleMiddleware {
  // Check if user has required role
  requireRole(allowedRoles) {
    return (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
        }

        const userRole = req.user.role;
        const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

        if (!roles.includes(userRole)) {
          return res.status(403).json({
            success: false,
            message: `Access denied. Required role: ${roles.join(' or ')}`
          });
        }

        next();
      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Role verification failed',
          error: error.message
        });
      }
    };
  }

  // Admin only access
  requireAdmin() {
    return this.requireRole('ADMIN');
  }

  // Student only access
  requireStudent() {
    return this.requireRole('STUDENT');
  }

  // Verifier only access
  requireVerifier() {
    return this.requireRole('VERIFIER');
  }

  // Admin or Student access
  requireAdminOrStudent() {
    return this.requireRole(['ADMIN', 'STUDENT']);
  }

  // Any authenticated user
  requireAnyRole() {
    return this.requireRole(['ADMIN', 'STUDENT', 'VERIFIER']);
  }

  // Check if user owns resource or is admin
  requireOwnershipOrAdmin(getResourceOwnerId) {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = req.user.id;
        const userRole = req.user.role;

        // Admin can access everything
        if (userRole === 'ADMIN') {
          return next();
        }

        // Get resource owner ID
        let resourceOwnerId;
        if (typeof getResourceOwnerId === 'function') {
          resourceOwnerId = await getResourceOwnerId(req);
        } else {
          resourceOwnerId = req.params[getResourceOwnerId] || req.body[getResourceOwnerId];
        }

        // Check ownership
        if (userId !== resourceOwnerId?.toString()) {
          return res.status(403).json({
            success: false,
            message: 'Access denied. You can only access your own resources.'
          });
        }

        next();
      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Ownership verification failed',
          error: error.message
        });
      }
    };
  }

  // Check college association for admin operations
  requireCollegeAssociation() {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
        }

        if (req.user.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            message: 'Admin role required'
          });
        }

        if (!req.user.college) {
          return res.status(403).json({
            success: false,
            message: 'College association required for this operation'
          });
        }

        next();
      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'College association verification failed',
          error: error.message
        });
      }
    };
  }

  // Rate limiting by role
  rateLimitByRole(limits = {}) {
    const defaultLimits = {
      ADMIN: 1000,    // requests per hour
      STUDENT: 100,
      VERIFIER: 500
    };

    const roleLimits = { ...defaultLimits, ...limits };

    return (req, res, next) => {
      // This is a placeholder for rate limiting logic
      // In production, use redis or similar for distributed rate limiting
      const userRole = req.user?.role || 'GUEST';
      const limit = roleLimits[userRole] || 10;

      // Add rate limiting headers
      res.set({
        'X-RateLimit-Limit': limit,
        'X-RateLimit-Remaining': limit - 1, // Simplified
        'X-RateLimit-Reset': new Date(Date.now() + 3600000).toISOString()
      });

      next();
    };
  }
}

module.exports = new RoleMiddleware();