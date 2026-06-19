const jwt = require("jsonwebtoken");

exports.sendTokenResponse = (owner, statusCode, res) => {
  const token = jwt.sign({ id: owner._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });

  const ownerData = {
    _id: owner._id,
    name: owner.name,
    email: owner.email,
    phone: owner.phone,
    profilePhoto: owner.profilePhoto,
    isEmailVerified: owner.isEmailVerified,
    isAadhaarVerified: owner.isAadhaarVerified,
    isPaid: owner.isPaid,
    accountStatus: owner.accountStatus,
    authMethod: owner.authMethod,
    createdAt: owner.createdAt,
  };

  res.status(statusCode).json({ success: true, token, owner: ownerData });
};
