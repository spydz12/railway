"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbClient = getDbClient;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
let _client = null;
function getDbClient() {
    if (!_client) {
        _client = (0, supabase_js_1.createClient)(config_1.config.supabase.url, config_1.config.supabase.serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    }
    return _client;
}
