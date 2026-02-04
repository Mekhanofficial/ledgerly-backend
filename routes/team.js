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

router.post('/accept/:token', acceptTeamInvite);

router.use(protect);

router.get('/', authorize('admin'), getTeamMembers);
router.post('/invite', authorize('admin'), inviteTeamMember);
router.post('/:id/resend-invite', authorize('admin'), resendInvitation);
router.put('/:id', authorize('admin'), updateTeamMember);
router.delete('/:id', authorize('admin'), removeTeamMember);

module.exports = router;
