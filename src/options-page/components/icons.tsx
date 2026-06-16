/** Inline provider SVG icon components for options-page controls. */
// src/options-page/components/icons.tsx

import React from "react";
import { cn } from "@/shared/utils/cn";

type ProviderIconProps = React.SVGProps<SVGSVGElement>;

function ProviderIconSvg({
	className,
	children,
	...props
}: ProviderIconProps & {
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			className={cn("a2a-provider-icon shrink-0", className)}
			{...props}
		>
			{children}
		</svg>
	);
}

export const SonarrIcon = ({
	className,
	...props
}: ProviderIconProps): React.ReactElement => (
	<ProviderIconSvg
		className={cn("a2a-provider-icon--sonarr", className)}
		{...props}
	>
		<g transform="translate(12 12) scale(1.12) translate(-12 -12)">
			<path
				fill="currentColor"
				d="m7.338 16.322l.165.159l-2.491 2.495l.13.129l2.493-2.498l.164.159l1.531-1.59l-.461-.444zm.106-8.651l-.161.161L8.855 9.4l.452-.453l-1.572-1.568l-.162.162L5 4.976c-.044.043-.084.088-.127.132ZM5 4.976l-.128.131c.043-.043.083-.088.128-.131m0-.001l-.129.13l.128-.131ZM16.631 16.24l-1.648-1.64l-.451.453l1.647 1.64l.161-.162l2.533 2.621l.007-.006l.053-.052c.023-.023.046-.048.067-.073L16.469 16.4ZM19 19.025c-.021.025-.044.05-.067.073zm-.127.127l.007-.006zm-2.397-11.69l.062.065zl-.163-.162l-1.549 1.575l.455.449l1.549-1.572l-.163-.16l2.544-2.476c-.042-.044-.083-.089-.126-.132Zm2.672-2.346l-.127-.132c.044.043.085.088.127.132m.024-.023l-.128-.131l-.022.021l.127.132zm-7.156 4.139a2.662 2.662 0 0 0-1.941.8a2.618 2.618 0 0 0-.795 1.745a.049.049 0 0 0 0 .019v.365a3.167 3.167 0 0 0 .037.325a2.61 2.61 0 0 0 .763 1.434a2.4 2.4 0 0 0 .342.292a2.761 2.761 0 0 0 3.2 0a2.443 2.443 0 0 0 .279-.233a.548.548 0 0 0 .059-.059a2.762 2.762 0 0 0 0-3.888a2.653 2.653 0 0 0-1.944-.8m6.917 9.862l-.053.052c.02-.017.036-.034.053-.052M5.823 4.238l-.008.007Zm-.822.736l-.002.002zm.307 14.333l-.02-.018ZM7.505 12.1a5.636 5.636 0 0 0-1.426-4.257c-.806-.806-1.92-1.916-1.923-1.919a9.314 9.314 0 0 0-2.024 5.35a.127.127 0 0 0-.018.064Q2.1 11.653 2.1 12c0 .219 0 .439.014.658a9.789 9.789 0 0 0 .132 1.169a9.281 9.281 0 0 0 2.038 4.4c.007-.007.9-.9 1.75-1.754A5.629 5.629 0 0 0 7.505 12.1m4.527 4.587c-1.806 0-3.036.167-4.358 1.49a432.34 432.34 0 0 0-1.694 1.7c.084.065.168.128.255.189a9.428 9.428 0 0 0 5.774 1.846a9.485 9.485 0 0 0 5.784-1.846c.1-.068.189-.139.282-.211l-1.6-1.6c-1.428-1.431-2.56-1.568-4.443-1.568m-6.113 3.142L5.9 19.81Zm-.31-.252l-.023-.021Zm6.423-11.986a5.862 5.862 0 0 0 4.441-1.562c.753-.753 1.744-1.74 1.762-1.758a9.523 9.523 0 0 0-6.226-2.18a9.557 9.557 0 0 0-6.186 2.147L7.683 6.1a5.788 5.788 0 0 0 4.349 1.491m6.99-2.607v-.001l-.009-.009l-.002-.002l.002.002Zm-1.183 3.037c-1.2 1.2-1.3 2.238-1.3 4.075a5.714 5.714 0 0 0 1.48 4.358c.879.879 1.712 1.708 1.734 1.73A9.547 9.547 0 0 0 21.9 12a9.614 9.614 0 0 0-2.429-6.531c.144.166.283.334.414.5zm1.525 10.616l-.022.023zM19.233 5.2l-.084-.089z"
			/>
		</g>
	</ProviderIconSvg>
);

export const RadarrIcon = ({
	className,
	...props
}: ProviderIconProps): React.ReactElement => (
	<ProviderIconSvg
		className={cn("a2a-provider-icon--radarr", className)}
		{...props}
	>
		<g transform="translate(12 12) scale(1.16) translate(-12 -12)">
			<path
				fill="currentColor"
				d="m8.06 16.01l7.199-4.113l-7.052-3.966Zm-1.028 3.82a2.96 2.96 0 0 1-2.5.294A3.372 3.372 0 0 0 8.648 21.3l10.136-5.876a1.731 1.731 0 0 0 .294-2.645zM19.225 9.106L8.8 3.083C6.738 1.614 3.359 2.5 3.359 6.168l.147 11.605c0 1.175.882 1.763 2.057 1.616L5.416 5.433c0-1.322.735-1.469 1.616-.881l11.752 6.61a2.894 2.894 0 0 1 1.47 2.2a3.307 3.307 0 0 0-1.029-4.256"
			/>
		</g>
	</ProviderIconSvg>
);

export const SeerrIcon = ({
	className,
	...props
}: ProviderIconProps): React.ReactElement => (
	<ProviderIconSvg
		className={cn("a2a-provider-icon--seerr", className)}
		{...props}
	>
		<path
			fill="currentColor"
			fillRule="evenodd"
			d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12Zm8-11c0 3.865-3.135 7-7 7s-7-3.135-7-7c0-.718.108-1.41.308-2.063A3.501 3.501 0 0 0 9.5 13 3.5 3.5 0 0 0 13 9.5a3.501 3.501 0 0 0-2.063-3.192A7.01 7.01 0 0 1 13 6c3.865 0 7 3.135 7 7Z"
		/>
	</ProviderIconSvg>
);
