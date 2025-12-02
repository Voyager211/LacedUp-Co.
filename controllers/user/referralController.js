const User = require('../../models/User');
const Wallet = require('../../models/Wallet');

exports.getReferralsPage = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get user's referral info
    const user = await User.findById(userId)
      .select('referralCode referralCount name email');

    // Get users referred by this user
    const referredUsers = await User.find({ referredBy: userId })
      .select('name email createdAt')
      .sort({ createdAt: -1 });

    // Get referral-related wallet transactions
    const wallet = await Wallet.findOne({ userId: userId });
    const referralTransactions = wallet ? 
      wallet.transactions.filter(t => t.paymentMethod === 'referral_reward')
        .sort((a, b) => new Date(b.date) - new Date(a.date)) : [];

    // Calculate total earnings from referrals
    const totalEarnings = referralTransactions.reduce(
      (sum, t) => sum + (t.type === 'credit' ? t.amount : 0), 
      0
    );

    // Build referral link
    const referralLink = `${req.protocol}://${req.get('host')}/signup?ref=${user.referralCode}`;

    res.render('user/referrals', {
      title: 'My Referrals',
      layout: 'user/layouts/user-layout',
      active: 'referrals',
      user,
      referredUsers,
      referralTransactions,
      totalEarnings,
      referralLink
    });

  } catch (error) {
    console.error('Error loading referrals page:', error);
    res.status(500).render('user/error', { 
      title: 'Error',
      message: 'Failed to load referrals page. Please try again later.' 
    });
  }
};
