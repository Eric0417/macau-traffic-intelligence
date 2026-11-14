# 0015: Complete the DSAT news TLS chain

Date: 2026-11-13

Status: Accepted

The DSAT news and arrangement pages returned current content through the system HTTPS client, while Node 22 rejected their incomplete certificate chain with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. The leaf identifies DigiCert Basic OV G5 TLS CN RSA4096 SHA384 2022 CA1 as its issuer.

Bundle that public intermediate certificate in the server-only source code and supply it, together with Node's bundled roots, through an Undici pool restricted to `https://www.dsat.gov.mo`. The intermediate signature was verified against Node's DigiCert TLS RSA4096 Root G5. Hostname, validity and chain verification remain enabled. Other origins use the normal fetch transport. Redirects are rejected for these direct DSAT endpoints, so the supplemental chain cannot follow a redirect to another origin. No credentials or TLS bypass are added.

The certificate came from the leaf's CA Issuers URL: `http://cacerts.digicert.cn/DigiCertBasicOVG5TLSCNRSA4096SHA3842022CA1.crt`. It expires on 2033-01-11. An offline test verifies its signature against Node's root store. Remove this transport customization when the publisher reliably serves the complete chain; review it if the issuer changes.

News and arrangement caches and their visible-page polling use 60 seconds. Existing stale-cache metadata and retry backoff remain. This is publication polling, not a real-time incident stream.
