"use strict";
const { settings } = require("./_lib/backend");
module.exports = (req, res) => settings(req, res);
