const User = require('../../models/User');
const Order = require('../../models/Order');

exports.getDashboard = async (req, res) => {
    try {
        // Replace these with actual aggregation logic later
        const totalUsers = await User.countDocuments({ isBlocked: false });
        const totalOrders = await Order.countDocuments();
        const totalSales = await Order.aggregate([
            { $match: { status: 'Delivered' }},
            { $group: { _id: null, total: { $sum: "$totalAmount" } } }
        ]);
        const pendingOrders = await Order.countDocuments({ status: 'Pending' });

        // Dummy monthly data for now
        const salesData = {
            months: ["Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"],
            net:    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 500, 2800],
            gross:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 520, 2888]
        };

        res.render('admin/dashboard', {
            title: 'Dashboard',
            totalUsers,
            totalOrders,
            totalSales: totalSales[0]?.total || 0,
            pendingOrders,
            salesData
        });

    } catch (err) {
        console.error('Dashboard Error: ', err);
        res.status(500).send('Dashboard load error');
    }
};