import { Router } from 'express';
import { panelAuthMiddleware } from '../middlewares/panelAuth';
import {
  postLogin,
  getMe,
  getDashboard,
  getUsers,
  getUser,
  patchUserBlock,
  patchUserApprove,
  postUserWipeContent,
  postUserResetPassword,
  getActivity,
  getSettings,
  patchSettings,
} from '../controllers/panel.controller';

const router = Router();

router.post('/auth/login', postLogin);

router.get('/me', panelAuthMiddleware, getMe);
router.get('/dashboard', panelAuthMiddleware, getDashboard);
router.get('/settings', panelAuthMiddleware, getSettings);
router.patch('/settings', panelAuthMiddleware, patchSettings);
router.get('/users', panelAuthMiddleware, getUsers);
router.get('/users/:id', panelAuthMiddleware, getUser);
router.patch('/users/:id/block', panelAuthMiddleware, patchUserBlock);
router.patch('/users/:id/approve', panelAuthMiddleware, patchUserApprove);
router.post('/users/:id/wipe-content', panelAuthMiddleware, postUserWipeContent);
router.post('/users/:id/reset-password', panelAuthMiddleware, postUserResetPassword);
router.get('/activity', panelAuthMiddleware, getActivity);

export default router;
