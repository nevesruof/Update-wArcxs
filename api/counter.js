"use strict";
const { counter } = require("./_lib/backend");
module.exports = (req, res) => counter(req, res);
