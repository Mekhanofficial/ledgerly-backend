const Report = require('../models/Report');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

const sanitizeReport = (report) => {
  if (!report) return null;
  const sanitized = report.toObject ? report.toObject() : { ...report };
  sanitized.id = sanitized.id || sanitized._id?.toString();
  return sanitized;
};

// @desc    List stored reports
// @route   GET /api/v1/reports/history
// @access  Private
exports.listReports = asyncHandler(async (req, res, next) => {
  const reports = await Report.find({ business: req.user.business })
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: reports.map(sanitizeReport)
  });
});

// @desc    Create report record
// @route   POST /api/v1/reports/history
// @access  Private
exports.createReport = asyncHandler(async (req, res, next) => {
  const {
    title,
    type,
    format,
    description,
    filters,
    options,
    metadata,
    summary,
    breakdown,
    status = 'processing',
    progress = 0,
    generatedAt
  } = req.body;

  if (!title) {
    return next(new ErrorResponse('Report title is required', 400));
  }

  const report = await Report.create({
    business: req.user.business,
    createdBy: req.user.id,
    title,
    description,
    type,
    format,
    filters,
    options,
    metadata,
    summary,
    breakdown,
    status,
    progress,
    generatedAt: generatedAt ? new Date(generatedAt) : new Date()
  });

  res.status(201).json({
    success: true,
    data: sanitizeReport(report)
  });
});

// @desc    Update existing report (status/progress or metadata)
// @route   PATCH /api/v1/reports/history/:id
// @access  Private
exports.updateReport = asyncHandler(async (req, res, next) => {
  const report = await Report.findOne({
    _id: req.params.id,
    business: req.user.business
  });

  if (!report) {
    return next(new ErrorResponse('Report not found', 404));
  }

  const updatable = ['status', 'progress', 'summary', 'breakdown', 'metadata', 'description', 'generatedAt', 'completedAt'];
  updatable.forEach(field => {
    if (req.body[field] !== undefined) {
      report[field] = req.body[field];
    }
  });

  await report.save();

  res.status(200).json({
    success: true,
    data: sanitizeReport(report)
  });
});

// @desc    Delete stored report
// @route   DELETE /api/v1/reports/history/:id
// @access  Private
exports.deleteReport = asyncHandler(async (req, res, next) => {
  const report = await Report.findOneAndDelete({
    _id: req.params.id,
    business: req.user.business
  });

  if (!report) {
    return next(new ErrorResponse('Report not found', 404));
  }

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Record download
// @route   POST /api/v1/reports/history/:id/download
// @access  Private
exports.recordDownload = asyncHandler(async (req, res, next) => {
  const report = await Report.findOne({
    _id: req.params.id,
    business: req.user.business
  });

  if (!report) {
    return next(new ErrorResponse('Report not found', 404));
  }

  report.downloads += 1;
  report.lastDownloaded = new Date();
  await report.save();

  res.status(200).json({
    success: true,
    data: sanitizeReport(report)
  });
});
