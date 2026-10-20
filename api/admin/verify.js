"use strict";
// POST /api/admin/verify  (cabecera x-admin-key)  ->  200 { ok: true } o 401
const { adminVerify } = require("../_lib/backend");
module.exports = (req, res) => adminVerify(req, res);
