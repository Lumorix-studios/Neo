import React from 'react';

type StarBorderProps<T extends React.ElementType> = React.ComponentPropsWithoutRef<T> & {
  as?: T;
  className?: string;
  innerClassName?: string;
  children?: React.ReactNode;
  color?: string;
  speed?: React.CSSProperties['animationDuration'];
  thickness?: number;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
};

const StarBorder = <T extends React.ElementType = 'button'>({
  as,
  className = '',
  innerClassName = '',
  color = 'white',
  speed = '6s',
  thickness = 1,
  backgroundColor = '#0707076f',
  textColor = '#ffffff',
  borderColor = '#222222',
  children,
  ...rest
}: StarBorderProps<T>) => {
  const Component = as || 'button';

  return (
    <Component
      className={`relative inline-block overflow-hidden ${className}`}
      {...(rest as Record<string, unknown>)}
      style={{
        padding: `${thickness}px 0`,
        ...((rest as Record<string, unknown>).style as React.CSSProperties)
      }}
    >
      {/* Thin light lines sweeping along each edge (sized by `thickness`) */}
      <div
        className="pointer-events-none absolute top-0 left-[-100%] w-full animate-star-movement-top z-0"
        style={{
          height: thickness,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          animationDuration: speed
        }}
      ></div>
      <div
        className="pointer-events-none absolute bottom-0 right-[-100%] w-full animate-star-movement-bottom z-0"
        style={{
          height: thickness,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          animationDuration: speed
        }}
      ></div>
      <div
        className="pointer-events-none absolute left-0 top-[-100%] h-full animate-star-movement-down z-0"
        style={{
          width: thickness,
          background: `linear-gradient(180deg, transparent, ${color}, transparent)`,
          animationDuration: speed
        }}
      ></div>
      <div
        className="pointer-events-none absolute right-0 bottom-[-100%] h-full animate-star-movement-up z-0"
        style={{
          width: thickness,
          background: `linear-gradient(180deg, transparent, ${color}, transparent)`,
          animationDuration: speed
        }}
      ></div>
      <div
        className={`relative z-1 border rounded-[inherit] ${innerClassName}`}
        style={{ background: backgroundColor, color: textColor, borderColor }}
      >
        {children}
      </div>
    </Component>
  );
};

export default StarBorder;

// tailwind.config.js
// module.exports = {
//   theme: {
//     extend: {
//       animation: {
//         'star-movement-bottom': 'star-movement-bottom linear infinite alternate',
//         'star-movement-top': 'star-movement-top linear infinite alternate',
//       },
//       keyframes: {
//         'star-movement-bottom': {
//           '0%': { transform: 'translate(0%, 0%)', opacity: '1' },
//           '100%': { transform: 'translate(-100%, 0%)', opacity: '0' },
//         },
//         'star-movement-top': {
//           '0%': { transform: 'translate(0%, 0%)', opacity: '1' },
//           '100%': { transform: 'translate(100%, 0%)', opacity: '0' },
//         },
//       },
//     },
//   }
// }
