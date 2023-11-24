const { ipcRenderer } = require('electron');
const { useEffect, useState, useRef } = require('react');

// Used in Renderer process

const noop = () => {};

const useTextFocus = () => {
    const htmlElRef = useRef(null)
    const setFocus = () => {
      if(htmlElRef.current) {
        htmlElRef.current.focus();
        htmlElRef.current.select()
      } 
    }

    return [ htmlElRef, setFocus ] 
}

/**
 * A custom hook to create ipc connection between BrowserView and ControlView
 *
 * @param {object} options
 * @param {function} options.onTabsUpdate - trigger after tabs updated(title, favicon, loading etc.)
 * @param {function} options.onTabActive - trigger after active tab changed
 */
module.exports = function useConnect(options = {}) {
  const { onTabsUpdate = noop, onTabActive = noop } = options;
  const [tabs, setTabs] = useState({});
  const [tabIDs, setTabIDs] = useState([]);
  const [activeID, setActiveID] = useState(null);
  const [urlInputRef, setUrlInputFocus] = useTextFocus()

  const channels = [
    [
      'tabs-update',
      (e, v) => {
        setTabIDs(v.tabs);
        setTabs(v.confs);
        onTabsUpdate(v);
      }
    ],
    [
      'active-update',
      (e, v) => {
        setActiveID(v);
        const activeTab = tabs[v] || {};
        onTabActive(activeTab);
      }
    ],
    [
      'focus-url-bar',
      (e, v) => {
        setUrlInputFocus()
      }
    ]
  ];

  useEffect(() => {
    ipcRenderer.send('control-ready');

    channels.forEach(([name, listener]) => ipcRenderer.on(name, listener));

    return () => {
      channels.forEach(([name, listener]) => ipcRenderer.removeListener(name, listener));
    };
  }, []);

  return { tabIDs, tabs, setTabs, activeID, urlInputRef };
};
