const errorHandler = (err, req, res, next) => {
  console.error("❌", err.message);
  let status  = err.statusCode || 500;
  let message = err.message    || "Server Error";

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    status  = 400;
  }
  if (err.name === "ValidationError") {
    message = Object.values(err.errors).map(e => e.message).join(", ");
    status  = 400;
  }
  if (err.name === "JsonWebTokenError") { message = "Invalid token"; status = 401; }
  if (err.name === "CastError")         { message = "Resource not found"; status = 404; }

  res.status(status).json({ success: false, message });
};

module.exports = errorHandler;
