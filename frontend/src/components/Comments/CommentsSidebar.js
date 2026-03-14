import React, { useEffect, useState, useRef, useContext } from 'react';
import { FaCheck } from 'react-icons/fa';
import { formatTimeAgo } from '../../utils/timeUtils';
import { AuthContext } from '../../contexts/AuthContext';
import '../../styles/components/comments/_sidebar.css';

export const CommentsSidebar = ({ editor, refreshKey = 0 }) => {
  const [comments, setComments] = useState([]);
  const [userThemes, setUserThemes] = useState(() => {
    // Initialize from localStorage if available
    const savedThemes = localStorage.getItem('userThemes');
    return savedThemes ? new Map(JSON.parse(savedThemes)) : new Map();
  });
  const sidebarRef = useRef(null);
  const { user } = useContext(AuthContext);

  console.log(user);

  const getThemeForUser = (username) => {
    if (!userThemes.has(username)) {
      // Assign a new theme, starting with red
      const availableThemes = ['red', 'blue', 'yellow', 'green'];
      const usedThemes = Array.from(userThemes.values());
      const unusedThemes = availableThemes.filter(theme => !usedThemes.includes(theme));
      
      // If all themes are used, start over
      const newTheme = unusedThemes.length > 0 
        ? unusedThemes[0] 
        : availableThemes[usedThemes.length % availableThemes.length];
      
      const newThemes = new Map(userThemes.set(username, newTheme));
      setUserThemes(newThemes);
      
      // Save to localStorage
      localStorage.setItem('userThemes', JSON.stringify(Array.from(newThemes.entries())));
    }
    return `comment-theme-${userThemes.get(username)}`;
  };

  const getCommentsFromDoc = () => {
    if (!editor) return [];
    const docComments = new Map(); // Use Map to ensure unique comments
    const editorView = editor.view;
    const editorContainer = editorView.dom.closest('.editor-content-container');
    const containerRect = editorContainer?.getBoundingClientRect();
    const scrollTop = editorContainer?.scrollTop || 0;

    console.log('Searching for comments in document...');

    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks) {
        node.marks.forEach((mark) => {
          if (mark.type.name === 'comment') {
            console.log('Found comment mark:', mark.attrs);
            const username = mark.attrs.username || user?.login;
            const theme = getThemeForUser(username);
            
            // Update the mark's class in the editor
            const markElement = editorView.dom.querySelector(`[data-comment-id="${mark.attrs.commentId}"]`);
            if (markElement) {
              markElement.className = `comment-mark ${theme}`;
            }
            
            const domPos = editorView.coordsAtPos(pos);
            if (domPos && containerRect) {
              // Calculate position relative to the comments container
              const relativeTop = domPos.top - containerRect.top + scrollTop;
              const commentHeight = 100; // Approximate height of a comment
              const adjustedTop = relativeTop - (commentHeight / 2); // Center the comment vertically
              
              console.log('Comment position:', { top: adjustedTop, exactTop: domPos.top });
              
              // Store comment with exact position
              docComments.set(mark.attrs.commentId, {
                id: mark.attrs.commentId,
                username,
                avatarUrl: mark.attrs.avatarUrl || user?.avatar_url,
                text: mark.attrs.text,
                position: pos,
                timestamp: mark.attrs.timestamp || new Date().toISOString(),
                top: adjustedTop,
                exactTop: domPos.top,
                rotation: 0,
                verticalOffset: 0,
                theme
              });
            }
          }
        });
      }
    });

    // Group comments by their vertical position
    const comments = Array.from(docComments.values());
    console.log('Total comments found:', comments.length);
    const groupedComments = [];
    let currentGroup = [];
    
    comments.sort((a, b) => a.exactTop - b.exactTop).forEach((comment, index) => {
      if (index === 0) {
        currentGroup = [comment];
      } else {
        const prevComment = currentGroup[currentGroup.length - 1];
        const COMMENT_HEIGHT = 100; // Approximate height of a comment
        const VERTICAL_OFFSET = 15; // Pixels to offset overlapping comments
        const overlap = Math.abs(comment.exactTop - prevComment.exactTop) < COMMENT_HEIGHT;
        
        if (overlap) {
          // Add rotation and vertical offset only if there will be multiple comments in group
          if (currentGroup.length === 1) {
            // First time we find an overlap, apply to the previous comment
            prevComment.rotation = -1;
            prevComment.verticalOffset = -VERTICAL_OFFSET;
          }
          comment.rotation = 1;
          comment.verticalOffset = VERTICAL_OFFSET;
          currentGroup.push(comment);
        } else {
          // If the group has only one comment, remove any rotation/offset
          if (currentGroup.length === 1) {
            currentGroup[0].rotation = 0;
            currentGroup[0].verticalOffset = 0;
          }
          groupedComments.push([...currentGroup]);
          currentGroup = [comment];
        }
      }
    });
    
    // Handle the last group
    if (currentGroup.length === 1) {
      currentGroup[0].rotation = 0;
      currentGroup[0].verticalOffset = 0;
    }
    if (currentGroup.length > 0) {
      groupedComments.push(currentGroup);
    }

    // Flatten and add group index
    return groupedComments.flatMap((group, groupIndex) => 
      group.map((comment, index) => ({
        ...comment,
        groupIndex,
        stackIndex: index,
        rotation: comment.rotation || 0,
        verticalOffset: comment.verticalOffset || 0
      }))
    );
  };

  useEffect(() => {
    if (!editor) return;

    const updateComments = () => {
      const docComments = getCommentsFromDoc();
      console.log('Comments updated:', docComments);
      setComments(docComments);
    };

    // Update comments whenever the editor content changes
    editor.on('update', updateComments);
    
    // Initial update after layout settles so coordsAtPos can use the visible editor.
    const refreshFrame = requestAnimationFrame(() => {
      requestAnimationFrame(updateComments);
    });

    const editorElement = editor.view.dom.closest('.editor-content-container');
    
    // Add hover listeners for comment marks in the editor
    const handleMarkMouseEnter = (e) => {
      const mark = e.target.closest('[data-comment-id]');
      if (mark) {
        handleMarkHover(mark.getAttribute('data-comment-id'));
      }
    };

    const handleMarkMouseLeave = (e) => {
      const mark = e.target.closest('[data-comment-id]');
      if (mark) {
        handleMarkLeave(mark.getAttribute('data-comment-id'));
      }
    };

    if (editorElement) {
      editorElement.addEventListener('mouseover', handleMarkMouseEnter);
      editorElement.addEventListener('mouseout', handleMarkMouseLeave);
      editorElement.addEventListener('scroll', updateComments);
    }

    return () => {
      editor.off('update', updateComments);
      cancelAnimationFrame(refreshFrame);
      if (editorElement) {
        editorElement.removeEventListener('mouseover', handleMarkMouseEnter);
        editorElement.removeEventListener('mouseout', handleMarkMouseLeave);
        editorElement.removeEventListener('scroll', updateComments);
      }
    };
  }, [editor, user, refreshKey]);

  const handleMarkHover = (commentId) => {
    requestAnimationFrame(() => {
      const comment = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
      if (!comment) return;
      
      // Bring comment to front
      const allComments = document.querySelectorAll('.comment-item');
      allComments.forEach(c => {
        if (c === comment) {
          c.style.zIndex = '100';
        } else {
          c.style.zIndex = '1';
        }
      });
      
      const marks = document.querySelectorAll(`[data-comment-id="${commentId}"]`);
      comment.classList.add('highlight');
      marks.forEach(mark => mark.classList.add('highlight'));
    });
  };

  const handleMarkLeave = (commentId) => {
    requestAnimationFrame(() => {
      const comment = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
      if (!comment) return;
      
      // Reset z-index
      comment.style.zIndex = '';
      
      const marks = document.querySelectorAll(`[data-comment-id="${commentId}"]`);
      comment.classList.remove('highlight');
      marks.forEach(mark => mark.classList.remove('highlight'));
    });
  };

  const handleReject = (commentId) => {
    if (!editor) return;

    // Store current scroll position
    const editorContainer = editor.view.dom.closest('.editor-content-container');
    const scrollTop = editorContainer?.scrollTop || 0;

    // Remove the comment mark
    editor.chain().focus().unsetComment(commentId).run();

    // Force a re-render without focusing
    editor.view.updateState(editor.view.state);

    // Update comments state
    const updatedComments = getCommentsFromDoc();
    setComments(updatedComments);

    // Restore scroll position
    if (editorContainer) {
      requestAnimationFrame(() => {
        editorContainer.scrollTop = scrollTop;
      });
    }
  };

  return (
    <div className="comments-sidebar" ref={sidebarRef}>
      <div className="comments-container">
        {comments.map((comment) => (
          <div
            key={comment.id}
            className={`comment-item ${comment.theme}`}
            data-comment-id={comment.id}
            data-line-index={comment.groupIndex}
            style={{
              '--comment-top': `${comment.top}px`,
              '--comment-rotation': `${comment.rotation}deg`,
              '--comment-vertical-offset': `${comment.verticalOffset}px`
            }}
            onMouseEnter={() => handleMarkHover(comment.id)}
            onMouseLeave={() => handleMarkLeave(comment.id)}
          >
            <div className="comment-header">
              <div className="comment-user-info">
                {comment.avatarUrl ? (
                  <img src={comment.avatarUrl} alt={comment.username} className="comment-avatar" />
                ) : (
                  <div className="comment-avatar-placeholder">
                    {comment.username?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <span className="comment-username">{comment.username}</span>
                <span className="comment-timestamp">{formatTimeAgo(comment.timestamp)}</span>
              </div>
            </div>
            <div className="comment-text">{comment.text}</div>
            <div className="comment-actions">
              <button onClick={() => handleReject(comment.id)} className="comment-remove-button">
                <FaCheck />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
