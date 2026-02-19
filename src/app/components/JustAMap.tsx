export function JustAMap() {
  return (
    <div style={{ 
      width: '100%', 
      height: '500px', 
      backgroundColor: '#4CAF50', 
      border: '3px solid #2E7D32',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      color: 'white',
      fontSize: '24px',
      fontWeight: 'bold'
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗺️</div>
      <div>THIS IS A MAP!</div>
      <div style={{ fontSize: '16px', marginTop: '8px' }}>GPS Tracking System</div>
      <div style={{ fontSize: '14px', marginTop: '16px', backgroundColor: 'white', color: 'green', padding: '8px 16px', borderRadius: '4px' }}>
        Status: WORKING
      </div>
    </div>
  );
}
