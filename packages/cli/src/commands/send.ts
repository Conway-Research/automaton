/**
 * Legacy independent relay signer retired as an unaccepted publication path.
 * The runtime SocialClient retains signed messaging behind exact content reviews,
 * persistent action audits and root gates. This CLI must never read a wallet or
 * create a second signing/approval implementation.
 */
console.error('Blocked: legacy CLI relay publication is not accepted. Use the reviewed Obolus runtime messaging path; no wallet was opened and no message was signed or sent.');
process.exitCode = 1;
export {};
