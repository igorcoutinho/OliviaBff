import { Router } from 'express';
import { getVersionCheck } from '../controllers/appVersion.controller';

const router = Router();

router.get('/version-check', getVersionCheck);

export default router;
