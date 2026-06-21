const jwt   = require('jsonwebtoken');
const Owner = require('../models/Owner');

exports.protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token)
      return res.status(401).json({ success: false, message: 'Not authorized, no token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.owner = await Owner.findById(decoded.id);
    if (!req.owner)
      return res.status(401).json({ success: false, message: 'Owner not found' });
    if (req.owner.accountStatus === 'suspended')
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact support.',
      });

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Not authorized, invalid token' });
  }
};
