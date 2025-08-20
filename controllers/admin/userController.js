const User = require('../../models/User');
const { getPagination } = require('../../utils/pagination');

exports.listUsers = async (req, res) => {
    try {
        const q = req.query.q || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 10;

        const query = q ? { email: { $regex: q, $options: 'i' } } : {};
        
        const { data: users, totalPages } = await getPagination(
            User.find(query).sort({ createdAt: -1 }),
            User,
            query,
            page,
            limit
        );

        res.render('admin/users', {
            users,
            currentPage: page,
            totalPages,
            searchQuery: q,
            title: 'User Management'
        });
    } catch (error) {
        console.error('Error in listUsers:', error);
        res.status(500).send('Internal Server Error');
    }
};

// AJAX rendering
exports.apiUsers = async (req, res) => {
    try {
        const q = req.query.q || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 10;

        const query = q ? {
            $or: [
                { name: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } },
                { phone: { $regex: q, $options: 'i' } }
            ]
            } : {};
        
        const { data: users, totalPages } = await getPagination(
            User.find(query).sort({ createdAt: -1 }),
            User,
            query,
            page,
            limit
        );

        res.json({ users, currentPage: page, totalPages });
    } catch (err) {
        console.error('Error fetching user data: ', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};


// AJAX blocking & unblocking
exports.apiBlockUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, {
      isBlocked: true,
      blockedAt: new Date()
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error blocking user:', err);
    res.status(500).json({ success: false, message: 'Error blocking user' });
  }
};

exports.apiUnblockUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, {
      isBlocked: false,
      blockedAt: null
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error unblocking user:', err);
    res.status(500).json({ success: false, message: 'Error unblocking user' });
  }
};
