---
name: Live domain deployment boundary
description: The tenant.travelintrips.co.id domain is served by Hostinger, not the active Replit deployment.
---

The Replit deployment service can report no active deployment while the custom domain still serves a Hostinger build. A successful workspace build or Replit publish does not update that domain; Hostinger must rebuild/restart from the updated source before live login behavior changes.

**Why:** The live health response identifies Hostinger and can remain healthy while serving an older API build with stale database/session configuration.

**How to apply:** Verify the live domain separately from `getDeploymentInfo()`. Treat a Hostinger restart or redeploy as an explicit external step, then re-test health, password session, and WhatsApp OTP over HTTPS.