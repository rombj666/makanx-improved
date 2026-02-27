declare module 'qrcode.react' {
  import * as React from 'react';

  export interface QRCodeProps {
    value: string;
    size?: number;
    includeMargin?: boolean;
  }

  const QRCode: React.ComponentType<QRCodeProps>;
  export default QRCode;
}

