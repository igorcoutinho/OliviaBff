const { Router } = require('express');
const { getSummary } = require('../controllers/admin.controller');
const { checkAdmin } = require('../middlewares/admin');

const router = Router();

router.get('/summary', checkAdmin, getSummary);

module.exports = router;
