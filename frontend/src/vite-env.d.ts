/// <reference types="vite/client" />

/// <reference types="vite/client" />

interface HTMLInputElement {
  webkitdirectory?: boolean;
  directory?: boolean;
}

declare namespace JSX {
  interface IntrinsicElements {
    input: React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> & {
      webkitdirectory?: boolean;
      directory?: boolean;
    };
  }
}
