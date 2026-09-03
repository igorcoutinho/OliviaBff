import { Router } from 'express';
import { getSummary } from '../controllers/admin.controller';
import { checkAdmin } from '../middlewares/admin';

const router = Router();

router.get('/summary', checkAdmin, getSummary);

export default router;
