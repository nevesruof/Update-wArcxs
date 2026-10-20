"use strict";
// POST /api/admin/cursor-token  (cabecera x-admin-key)  ->  { token } para ser "dueno" en los cursores
const { cursorToken } = require("../_lib/backend");
module.exports = (req, res) => cursorToken(req, res);
