const errorMiddleware = (err, req, res, _next) => {
  console.error("Unhandled error:", err.message);

  res.status(500).json({
    message: "Internal server error"
  });
};

module.exports = errorMiddleware;