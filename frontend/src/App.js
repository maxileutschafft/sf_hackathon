import React, { useState } from 'react';
import './App.css';
import Home from './Home';
import MissionPlanning from './MissionPlanning';
import MissionControl from './MissionControl';
import MissionSelect from './MissionSelect';

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [selectedMissionData, setSelectedMissionData] = useState(null);

  const handleNavigate = (view) => {
    setCurrentView(view);
  };

  const handleNavigateHome = () => {
    setCurrentView('home');
    setSelectedMissionData(null);
  };

  const handleMissionSelected = (missionData) => {
    setSelectedMissionData(missionData);
    setCurrentView('control');
  };

  if (currentView === 'planning') {
    return <MissionPlanning onNavigateHome={handleNavigateHome} />;
  }

  if (currentView === 'select') {
    return <MissionSelect onNavigateHome={handleNavigateHome} onMissionSelected={handleMissionSelected} />;
  }

  if (currentView === 'control') {
    return <MissionControl onNavigateHome={handleNavigateHome} missionData={selectedMissionData} />;
  }

  return <Home onNavigate={handleNavigate} />;
}

export default App;
