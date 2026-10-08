// Loaded before @napi-rs/canvas so missing project fonts cannot fall back to OS fonts.
process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
