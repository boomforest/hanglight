// WalletInput.jsx - Create this file in src/
import React, { useState } from 'react';

const WalletInput = ({ onWalletSave, currentWallet }) => {
  const [walletAddress, setWalletAddress] = useState(currentWallet || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const address = walletAddress.trim();
    
    // Basic validation - check if it looks like an Ethereum address
    if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      alert('Please enter a valid Ethereum address (0x followed by 40 characters)');
      return;
    }

    setIsSaving(true);
    await onWalletSave(address);
    setIsSaving(false);
  };

  const handleClear = async () => {
    setWalletAddress('');
    setIsSaving(true);
    await onWalletSave('');
    setIsSaving(false);
  };

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div style={{
      background: 'rgba(240, 240, 240, 0.5)',
      borderRadius: '10px',
      padding: '1rem',
      marginBottom: '1rem'
    }}>
      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#333' }}>
        🔗 Wallet Address
      </h4>
      
      {currentWallet ? (
        <div>
          <div style={{
            background: 'rgba(40, 167, 69, 0.1)',
            border: '1px solid #28a745',
            borderRadius: '8px',
            padding: '0.5rem',
            marginBottom: '0.5rem',
            fontSize: '0.8rem',
            color: '#155724'
          }}>
            Connected: {formatAddress(currentWallet)}
          </div>
          <button
            onClick={handleClear}
            disabled={isSaving}
            style={{
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '0.4rem 0.8rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
              opacity: isSaving ? 0.5 : 1
            }}
          >
            {isSaving ? 'Removing...' : 'Remove'}
          </button>
        </div>
      ) : (
        <div>
          <input
            type="text"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="0x1234567890abcdef..."
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '6px',
              fontSize: '0.8rem',
              marginBottom: '0.5rem',
              boxSizing: 'border-box',
              fontFamily: 'monospace'
            }}
          />
          <button
            onClick={handleSave}
            disabled={isSaving || !walletAddress.trim()}
            style={{
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '0.4rem 0.8rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
              opacity: (isSaving || !walletAddress.trim()) ? 0.5 : 1
            }}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
};

export default WalletInput;
