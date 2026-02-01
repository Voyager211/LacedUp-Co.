const User = require('../../models/User');
const getPagination = require('../../utils/pagination');


const listUsers = async (req, res) => {
    try {
        const q = req.query.q || '';
        const status = req.query.status || 'all'; // all, blocked, unblocked
        const page = parseInt(req.query.page) || 1;
        const limit = 10;

        // Build query with role filter
        const query = { role: 'user' };
        
        // Add search filter
        if (q) {
            query.$or = [
                { name: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } },
                { phone: { $regex: q, $options: 'i' } }
            ];
        }
        
        // Add blocking status filter
        if (status === 'blocked') {
            query.isBlocked = true;
        } else if (status === 'unblocked') {
            query.isBlocked = false;
        }
        // 'all' - no isBlocked filter added
        
        const { data: users, totalPages } = await getPagination(
            User.find(query).sort({ createdAt: -1 }),
            User,
            query,
            page,
            limit
        );

        const totalUserCount = await User.countDocuments({ role: 'user' });

        res.render('admin/users', {
            users,
            currentPage: page,
            totalPages,
            searchQuery: q,
            statusFilter: status,
            totalUserCount,
            title: 'User Management'
        });
    } catch (error) {
        console.error('Error in listUsers:', error);
        res.status(500).send('Internal Server Error');
    }
};


// AJAX rendering
const apiUsers = async (req, res) => {
    try {
        const q = req.query.q || '';
        const status = req.query.status || 'all'; // all, blocked, unblocked
        const page = parseInt(req.query.page) || 1;
        const limit = 10;

        // Build query with role filter
        const query = { role: 'user' };
        
        // Add search filter
        if (q) {
            query.$or = [
                { name: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } },
                { phone: { $regex: q, $options: 'i' } }
            ];
        }
        
        // Add blocking status filter
        if (status === 'blocked') {
            query.isBlocked = true;
        } else if (status === 'unblocked') {
            query.isBlocked = false;
        }
        // 'all' - no isBlocked filter added
        
        const { data: users, totalPages } = await getPagination(
            User.find(query).sort({ createdAt: -1 }),
            User,
            query,
            page,
            limit
        );

        res.json({ users, currentPage: page, totalPages, statusFilter: status });
    } catch (err) {
        console.error('Error fetching user data: ', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};


// AJAX blocking & unblocking
const apiBlockUser = async (req, res) => {
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


const apiUnblockUser = async (req, res) => {
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


module.exports = {
    listUsers,
    apiUsers,
    apiBlockUser,
    apiUnblockUser
};
