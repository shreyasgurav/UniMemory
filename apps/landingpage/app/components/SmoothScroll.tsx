"use client";

import { ReactLenis } from "@studio-freight/react-lenis";

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
    return (
        <ReactLenis
            root
            options={{
                duration: 0.8,
                lerp: 0.15,
                easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
                orientation: 'vertical',
                gestureOrientation: 'vertical',
                smoothWheel: true,
                wheelMultiplier: 1,
                touchMultiplier: 2,
                infinite: false,
            }}
        >
            {children}
        </ReactLenis>
    );
}
