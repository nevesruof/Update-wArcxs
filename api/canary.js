"use strict";
const { handleCanary } = require("./_lib/canary");
module.exports = (req, res) => handleCanary(req, res);
