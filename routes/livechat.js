const express = require('express');
const router = express.Router();
const {
  getLiveChatEligibility,
  getLiveChatStatus,
  sendLiveChatMessage
} = require('../controllers/liveChatController');
const { protect, authorize } = require('../middleware/auth');
const { checkFeatureAccess } = require('../middleware/subscription');

router.use(protect);
router.use(authorize('super_admin', 'admin', 'accountant', 'staff', 'client', 'sales', 'viewer'));

router.get('/eligibility', getLiveChatEligibility);
router.get('/status', checkFeatureAccess('liveChat'), getLiveChatStatus);
router.post('/message', checkFeatureAccess('liveChat'), sendLiveChatMessage);

module.exports = router;
