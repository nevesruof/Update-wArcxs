"use strict";
// GET|POST|HEAD /api/canary?trap=clone|bait|scan  (ver api/_lib/canary.js)
const { handleCanary } = require("./_lib/canary");
module.exports = (req, res) => handleCanary(req, res);
