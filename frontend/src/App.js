import React, { useState } from 'react';
import './App.css';
import Home from './Home';
import MissionPlanning from './MissionPlanning';
import MissionControl from './MissionControl';

function App() {
  const [currentView, setCurrentView] = useState('home');

  const handleNavigate = (view) => {
    setCurrentView(view);
  };

  const handleNavigateHome = () => {
    setCurrentView('home');
  };

  if (currentView === 'planning') {
    return <MissionPlanning onNavigateHome={handleNavigateHome} />;
  }

  if (currentView === 'control') {
    return <MissionControl onNavigateHome={handleNavigateHome} />;
  }

  return <Home onNavigate={handleNavigate} />;
}

export default App;
