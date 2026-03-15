import React from 'react';
import { getCurrentTime, isWithin30Minutes } from '../utils/timeUtils';

const WarningBanner = ({ editors, currentUser }) => {
  if (!Array.isArray(editors) || editors.length === 0) return null;

  const now = new Date(getCurrentTime());
  const activeEditors = editors.filter(editor => isWithin30Minutes(editor.timestamp));
  const currentUserName = currentUser?.name || currentUser?.login || null;

  if (activeEditors.length === 0) return null;

  const isFirstUser = currentUserName ? activeEditors[0].name === currentUserName : false;
  const otherEditors = currentUserName
    ? activeEditors.filter(editor => editor.name !== currentUserName)
    : activeEditors.slice(1);

  const renderMessage = () => {
    if (isFirstUser) {
      return `You are the only recent editor of this file.`;
    } else if (otherEditors.length > 0) {
      return (
        <>
          <strong>Warning:</strong> {activeEditors[0].name} and {otherEditors.length} other{otherEditors.length === 1 ? '' : 's'} have this file open. Concurrent editing might create conflicts. Feel free to read and browse.
        </>
      );
    } else {
      return (
        <>
          <strong>Warning:</strong> {activeEditors[0].name} started editing {Math.round((now.getTime() - new Date(activeEditors[0].timestamp).getTime()) / (1000 * 60))} minutes ago. Concurrent editing might create conflicts
        </>
      );
    }
  };

  return (
    <div style={{
      backgroundColor: 'rgba(255, 215, 0, 0.2)',
      color: '#856404',
      padding: '12px',
      borderRadius: '4px',
      margin: '10px 0',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontFamily: 'Inter, sans-serif',
      fontSize: '14px',
      fontWeight: 200
    }}>
      <div style={{ display: 'flex', marginRight: '10px' }}>
        {activeEditors.map((editor, index) => (
          <img 
            key={editor.name}
            src={editor.avatar_url} 
            alt={editor.name} 
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              marginLeft: index === 0 ? 0 : '-15px',
              border: '2px solid white',
              zIndex: activeEditors.length - index
            }}
          />
        ))}
      </div>
      <span>
        {renderMessage()}
      </span>
    </div>
  );
};

export default WarningBanner;
