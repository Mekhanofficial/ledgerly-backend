const Invoice = require('../models/Invoice');
const Receipt = require('../models/Receipt');
const Payment = require('../models/Payment');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get dashboard overview
// @route   GET /api/v1/reports/dashboard
// @access  Private
exports.getDashboard = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const business = req.user.business;
  
  const dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) dateFilter.date.$gte = new Date(startDate);
    if (endDate) dateFilter.date.$lte = new Date(endDate);
  }
  
  // Get today's date range
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  
  const todayFilter = {
    date: { $gte: todayStart, $lt: todayEnd }
  };
  
  // Get this month's date range
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  
  const monthFilter = {
    date: { $gte: monthStart, $lt: monthEnd }
  };
  
  // Execute all queries in parallel
  const [
    totalRevenue,
    todayRevenue,
    monthRevenue,
    outstandingInvoices,
    totalCustomers,
    totalProducts,
    lowStockProducts,
    recentInvoices,
    recentPayments,
    salesByDay,
    topProducts
  ] = await Promise.all([
    // Total revenue
    Invoice.aggregate([
      { $match: { business, status: 'paid', ...dateFilter } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]),
    
    // Today's revenue
    Invoice.aggregate([
      { $match: { business, status: 'paid', ...todayFilter } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]),
    
    // This month's revenue
    Invoice.aggregate([
      { $match: { business, status: 'paid', ...monthFilter } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]),
    
    // Outstanding invoices
    Invoice.aggregate([
      { $match: { business, status: { $in: ['sent', 'partial', 'overdue'] }, balance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$balance' }, count: { $sum: 1 } } }
    ]),
    
    // Total customers
    Customer.countDocuments({ business, isActive: true }),
    
    // Total products
    Product.countDocuments({ business, isActive: true }),
    
    // Low stock products
    Product.countDocuments({
      business,
      isActive: true,
      trackInventory: true,
      alertOnLowStock: true,
      $expr: { $lte: ['$stock.available', '$stock.lowStockThreshold'] }
    }),
    
    // Recent invoices
    Invoice.find({ business })
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(5),
    
    // Recent payments
    Payment.find({ business })
      .populate('customer', 'name')
      .sort({ paymentDate: -1 })
      .limit(5),
    
    // Sales by day (last 7 days)
    Invoice.aggregate([
      {
        $match: {
          business,
          status: 'paid',
          date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          total: { $sum: '$total' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    
    // Top products
    Invoice.aggregate([
      { $match: { business, status: 'paid', ...dateFilter } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 }
    ])
  ]);
  
  // Process top products to get product names
  const topProductsWithNames = await Promise.all(
    topProducts.map(async (item) => {
      if (item._id) {
        const product = await Product.findById(item._id).select('name sku');
        return {
          ...item,
          product: product || { name: 'Unknown Product', sku: 'N/A' }
        };
      }
      return item;
    })
  );
  
  res.status(200).json({
    success: true,
    data: {
      overview: {
        totalRevenue: totalRevenue[0]?.total || 0,
        todayRevenue: todayRevenue[0]?.total || 0,
        monthRevenue: monthRevenue[0]?.total || 0,
        outstanding: outstandingInvoices[0]?.total || 0,
        outstandingCount: outstandingInvoices[0]?.count || 0,
        totalCustomers,
        totalProducts,
        lowStockProducts
      },
      recentActivity: {
        invoices: recentInvoices,
        payments: recentPayments
      },
      charts: {
        salesByDay,
        topProducts: topProductsWithNames
      }
    }
  });
});

// @desc    Get sales report
// @route   GET /api/v1/reports/sales
// @access  Private
exports.getSalesReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;
  const business = req.user.business;
  
  const match = { business, status: 'paid' };
  
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }
  
  let dateFormat;
  switch (groupBy) {
    case 'day':
      dateFormat = '%Y-%m-%d';
      break;
    case 'month':
      dateFormat = '%Y-%m';
      break;
    case 'year':
      dateFormat = '%Y';
      break;
    default:
      dateFormat = '%Y-%m-%d';
  }
  
  const salesReport = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$date' } },
        totalRevenue: { $sum: '$total' },
        totalInvoices: { $sum: 1 },
        averageSale: { $avg: '$total' },
        taxCollected: { $sum: '$tax.amount' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  // Get payment method breakdown
  const paymentMethods = await Payment.aggregate([
    { $match: { business, status: 'completed' } },
    {
      $group: {
        _id: '$paymentMethod',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { total: -1 } }
  ]);
  
  // Get top customers
  const topCustomers = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$customer',
        totalSpent: { $sum: '$total' },
        invoiceCount: { $sum: 1 }
      }
    },
    { $sort: { totalSpent: -1 } },
    { $limit: 10 }
  ]);
  
  // Get customer names
  const topCustomersWithNames = await Promise.all(
    topCustomers.map(async (item) => {
      const customer = await Customer.findById(item._id).select('name email');
      return {
        ...item,
        customer: customer || { name: 'Unknown Customer' }
      };
    })
  );
  
  res.status(200).json({
    success: true,
    data: {
      salesReport,
      paymentMethods,
      topCustomers: topCustomersWithNames,
      summary: {
        totalRevenue: salesReport.reduce((sum, item) => sum + item.totalRevenue, 0),
        totalInvoices: salesReport.reduce((sum, item) => sum + item.totalInvoices, 0),
        totalTax: salesReport.reduce((sum, item) => sum + item.taxCollected, 0)
      }
    }
  });
});

// @desc    Get inventory report
// @route   GET /api/v1/reports/inventory
// @access  Private
exports.getInventoryReport = asyncHandler(async (req, res) => {
  const { category, lowStockOnly } = req.query;
  const business = req.user.business;
  
  let match = { business, isActive: true };
  if (category) match.category = category;
  
  if (lowStockOnly === 'true') {
    match.$expr = { $lte: ['$stock.available', '$stock.lowStockThreshold'] };
  }
  
  const products = await Product.find(match)
    .populate('category', 'name')
    .populate('supplier', 'name')
    .sort({ 'stock.available': 1 });
    
  // Calculate inventory value
  const inventoryValue = products.reduce((total, product) => {
    return total + (product.stock.quantity * product.costPrice);
  }, 0);
  
  // Calculate sales value
  const salesValue = products.reduce((total, product) => {
    return total + (product.stock.quantity * product.sellingPrice);
  }, 0);
  
  // Get stock movement
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const stockMovement = await InventoryTransaction.aggregate([
    {
      $match: {
        business,
        createdAt: { $gte: thirtyDaysAgo },
        type: { $in: ['sale', 'purchase', 'adjustment'] }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        sold: {
          $sum: {
            $cond: [{ $in: ['$type', ['sale', 'sale_completed']] }, { $abs: '$quantity' }, 0]
          }
        },
        purchased: {
          $sum: {
            $cond: [{ $eq: ['$type', 'purchase'] }, '$quantity', 0]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  res.status(200).json({
    success: true,
    data: {
      products,
      summary: {
        totalProducts: products.length,
        inventoryValue,
        salesValue,
        lowStockCount: products.filter(p => p.isLowStock()).length
      },
      stockMovement
    }
  });
});

// @desc    Get profit and loss report
// @route   GET /api/v1/reports/profit-loss
// @access  Private
exports.getProfitLossReport = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const business = req.user.business;
  
  const match = { business, status: 'paid' };
  
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }
  
  // Calculate revenue
  const revenueData = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$total' },
        totalCost: { $sum: '$subtotal' } // Assuming subtotal is cost for simplicity
      }
    }
  ]);
  
  // Get expense categories (you would need an Expense model)
  // This is a simplified version
  const revenue = revenueData[0]?.totalRevenue || 0;
  const costOfGoodsSold = revenueData[0]?.totalCost || 0;
  const grossProfit = revenue - costOfGoodsSold;
  
  // Get operating expenses (simplified)
  const operatingExpenses = await Payment.aggregate([
    {
      $match: {
        business,
        paymentMethod: 'expense', // You would need to categorize expenses
        paymentDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' }
      }
    }
  ]);
  
  const expenses = operatingExpenses[0]?.total || 0;
  const netProfit = grossProfit - expenses;
  
  res.status(200).json({
    success: true,
    data: {
      revenue: {
        total: revenue,
        details: []
      },
      costOfGoodsSold: {
        total: costOfGoodsSold,
        percentage: revenue > 0 ? (costOfGoodsSold / revenue) * 100 : 0
      },
      grossProfit: {
        total: grossProfit,
        margin: revenue > 0 ? (grossProfit / revenue) * 100 : 0
      },
      operatingExpenses: {
        total: expenses,
        details: []
      },
      netProfit: {
        total: netProfit,
        margin: revenue > 0 ? (netProfit / revenue) * 100 : 0
      }
    }
  });
});