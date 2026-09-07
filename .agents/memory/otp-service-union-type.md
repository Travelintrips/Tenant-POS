---
name: OTP production and password login separation
description: Password-based production login must not change WhatsApp OTP delivery or expose OTP values.
---

`ENABLE_DEV_LOGIN` and the configured password may enable the alternative role/password login, but they must not make WhatsApp OTP use its development response. Returning `devOtp` is allowed only when `NODE_ENV` is not `production`; production must return `plainOtp` internally for provider delivery.

**Why:** Coupling the password-login switch to OTP mode can silently stop WhatsApp delivery and expose the generated OTP to the browser in production.

**How to apply:** When changing authentication flags, test the combination `NODE_ENV=production` plus `ENABLE_DEV_LOGIN=true`: password login remains available, while the OTP request response contains no OTP and delivery goes through the WhatsApp provider.