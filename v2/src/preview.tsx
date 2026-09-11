import React from 'react';
import {createRoot} from 'react-dom/client';
import DesignPreview from './DesignPreview';
// Always render the local review interface, including Android content:// URLs.
// This entry never imports login, server clients, or the legacy stylesheet.
createRoot(document.getElementById('root')!).render(<DesignPreview/>);
