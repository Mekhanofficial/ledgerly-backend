const express = require('express');
const router = express.Router();
const {
  getTeamMembers,
  inviteTeamMember,
  resendInvitation,
  acceptTeamInvite,
  updateTeamMember,
  removeTeamMember
} = require('../controllers/teamController');
const { protect, authorize } = require('../middleware/auth');
const { checkTeamLimit } = require('../middleware/subscription');

router.post('/accept/:token', acceptTeamInvite);

router.use(protect);

router.get('/', authorize('super_admin', 'admin'), getTeamMembers);
router.post('/invite', authorize('super_admin', 'admin'), checkTeamLimit, inviteTeamMember);
router.post('/:id/resend-invite', authorize('super_admin', 'admin'), resendInvitation);
router.put('/:id', authorize('super_admin', 'admin'), updateTeamMember);
router.delete('/:id', authorize('super_admin', 'admin'), removeTeamMember);

module.exports = router;
