const { Router } = require('express');
const { registerHandler, loginHandler, meHandler } = require('../controllers/auth.controller');
const { authMiddleware } = require('../middlewares/auth');

const router = Router();

router.post('/register', registerHandler);
router.post('/login', loginHandler);
router.get('/me', authMiddleware, meHandler);

module.exports = router;
