const express = require('express');
const router = express.Router();

// 🔥 In-memory graph state (later connect DB)
let graphState = {
  mode: "auto", // "manual" or "auto"
  trend: "up",  // up / down
  x: 0,
  y: 0
};

// 📊 GET GRAPH DATA
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: graphState
  });
});

// 🛠️ SET MANUAL GRAPH CONTROL (ADMIN)
router.post('/manual', (req, res) => {
  const { x, y, trend } = req.body;

  graphState.mode = "manual";
  graphState.x = x || graphState.x;
  graphState.y = y || graphState.y;
  graphState.trend = trend || graphState.trend;

  res.json({
    success: true,
    message: "Manual graph control updated ⚙️",
    graph: graphState
  });
});

// 🤖 AI MODE CONTROL
router.post('/auto', (req, res) => {
  const { buyCount, sellCount } = req.body;

  graphState.mode = "auto";

  if (buyCount > sellCount) {
    graphState.trend = "down"; // profit logic
  } else {
    graphState.trend = "up";
  }

  res.json({
    success: true,
    message: "AI graph updated 🤖",
    graph: graphState
  });
});

// 🔄 GENERATE NEXT GRAPH POINT
router.get('/next', (req, res) => {
  let movement = Math.random() * 5;

  if (graphState.trend === "up") {
    graphState.y += movement;
  } else {
    graphState.y -= movement;
  }

  graphState.x += 1;

  res.json({
    success: true,
    point: {
      x: graphState.x,
      y: graphState.y
    },
    trend: graphState.trend,
    mode: graphState.mode
  });
});

// 🔁 RESET GRAPH
router.post('/reset', (req, res) => {
  graphState = {
    mode: "auto",
    trend: "up",
    x: 0,
    y: 0
  };

  res.json({
    success: true,
    message: "Graph reset 🔄",
    graph: graphState
  });
});

module.exports = router;
