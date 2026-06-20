/** Provider URL security classifier for connection warnings. */
// src/providers/settings/insecure-url.ts

export function isPublicHttpProviderUrl(input: string): boolean {
	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		return false;
	}

	if (url.protocol !== "http:") {
		return false;
	}

	const host = url.hostname.toLowerCase();
	if (isLocalHostName(host) || isLocalIpv6(host)) {
		return false;
	}

	return !isLocalIpv4(host);
}

function isLocalHostName(host: string): boolean {
	return (
		host === "localhost" ||
		(!host.includes(".") && !host.includes(":") && !host.startsWith("[")) ||
		host.endsWith(".local") ||
		host.endsWith(".lan")
	);
}

function isLocalIpv6(host: string): boolean {
	const normalized = host.replace(/^\[(.*)]$/, "$1");
	if (!normalized.includes(":")) return false;

	return (
		normalized === "::1" ||
		normalized.startsWith("fc") ||
		normalized.startsWith("fd") ||
		normalized.startsWith("fe8") ||
		normalized.startsWith("fe9") ||
		normalized.startsWith("fea") ||
		normalized.startsWith("feb")
	);
}

function isLocalIpv4(host: string): boolean {
	const parts = host.split(".");
	if (parts.length !== 4) return false;

	const octets = parts.map((part) => {
		if (!/^\d+$/.test(part)) return Number.NaN;
		return Number(part);
	});

	if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
		return false;
	}

	const first = octets[0];
	const second = octets[1];
	if (first === undefined || second === undefined) return false;

	return (
		first === 127 ||
		first === 10 ||
		(first === 169 && second === 254) ||
		(first === 192 && second === 168) ||
		(first === 172 && second >= 16 && second <= 31)
	);
}
