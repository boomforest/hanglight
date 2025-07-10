import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import WalletInput from './WalletInput';

function App() {
  const [supabase, setSupabase] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [allProfiles, setAllProfiles] = useState([])
  const [activeTab, setActiveTab] = useState('login')
  const [showSendForm, setShowSendForm] = useState(null)
  const [showReleaseForm, setShowReleaseForm] = useState(null)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: ''
  })
  const [transferData, setTransferData] = useState({
    recipient: '',
    amount: ''
  })
  const [releaseData, setReleaseData] = useState({
    amount: '',
    reason: ''
  })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)
  const [isReleasing, setIsReleasing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const initSupabase = async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const client = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY
        )
        setSupabase(client)
        setMessage('')

        const { data: { session } } = await client.auth.getSession()
        if (session?.user) {
          setUser(session.user)
          await ensureProfileExists(session.user, client)
          await loadAllProfiles(client)
        }
      } catch (error) {
        setMessage('Connection failed')
        console.error('Supabase error:', error)
      }
    }
    initSupabase()
  }, [])

  const ensureProfileExists = async (authUser, client = supabase) => {
    try {
      const { data: existingProfile } = await client
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (existingProfile) {
        setProfile(existingProfile)
        return existingProfile
      }

      const username = authUser.user_metadata?.username || 'USER' + Math.random().toString(36).substr(2, 3).toUpperCase()
      const isJPR333 = username === 'JPR333'
      
      const newProfile = {
        id: authUser.id,
        username: username,
        email: authUser.email,
        dov_balance: isJPR333 ? 1000000 : 0,
        djr_balance: isJPR333 ? 1000000 : 0
      }

      const { data: createdProfile, error: createError } = await client
        .from('profiles')
        .insert([newProfile])
        .select()
        .single()

      if (createError) {
        setMessage('Profile creation failed: ' + createError.message)
        return null
      }

      setProfile(createdProfile)
      setMessage('Profile created successfully!')
      return createdProfile
    } catch (error) {
      setMessage('Error creating profile: ' + error.message)
      return null
    }
  }

  // NEW FUNCTION: Handle wallet address save
  const handleWalletSave = async (walletAddress) => {
    if (!supabase || !user) {
      console.log('No supabase client or user available')
      return
    }

    try {
      // Update the profile with the wallet address
      const { error } = await supabase
        .from('profiles')
        .update({ wallet_address: walletAddress || null })
        .eq('id', user.id)

      if (error) {
        console.error('Error saving wallet address:', error)
        setMessage('Failed to save wallet address: ' + error.message)
        return
      }

      // Refresh the profile to show the updated wallet address
      await ensureProfileExists(user)
      
      if (walletAddress) {
        setMessage('Wallet address saved! 🎉')
      } else {
        setMessage('Wallet address removed')
      }
    } catch (error) {
      console.error('Error handling wallet save:', error)
      setMessage('Error saving wallet: ' + error.message)
    }
  }

  const loadAllProfiles = async (client = supabase) => {
    try {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setAllProfiles(data || [])
    } catch (error) {
      console.error('Error loading profiles:', error)
    }
  }

  const handleRegister = async () => {
    if (!supabase) {
      setMessage('Please wait for connection...')
      return
    }

    if (!formData.email || !formData.password || !formData.username) {
      setMessage('Please fill in all fields')
      return
    }

    if (!/^[A-Z]{3}[0-9]{3}$/.test(formData.username)) {
      setMessage('Username must be 3 letters + 3 numbers (e.g., ABC123)')
      return
    }

    try {
      setLoading(true)
      setMessage('Creating account...')

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            username: formData.username
          }
        }
      })

      if (authError) {
        setMessage('Registration failed: ' + authError.message)
        return
      }

      if (!authData.user) {
        setMessage('Registration failed: No user returned')
        return
      }

      setMessage('Account created, setting up profile...')
      const profile = await ensureProfileExists(authData.user)
      
      if (profile) {
        setUser(authData.user)
        await loadAllProfiles()
        setMessage('Registration successful!')
        setFormData({ email: '', password: '', username: '' })
      } else {
        setMessage('Account created but profile setup failed. Please try logging in.')
      }
    } catch (err) {
      setMessage('Registration error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    if (!supabase) {
      setMessage('Please wait for connection...')
      return
    }

    if (!formData.email || !formData.password) {
      setMessage('Please fill in email and password')
      return
    }

    try {
      setLoading(true)
      setMessage('Logging in...')

      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      })

      if (error) {
        setMessage('Login failed: ' + error.message)
        return
      }

      setMessage('Login successful, checking profile...')
      setUser(data.user)
      await ensureProfileExists(data.user)
      await loadAllProfiles()
      setFormData({ email: '', password: '', username: '' })
    } catch (err) {
      setMessage('Login error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    setUser(null)
    setProfile(null)
    setAllProfiles([])
    setShowSettings(false)
    setShowSendForm(null)
    setShowReleaseForm(null)
    setMessage('')
    setFormData({ email: '', password: '', username: '' })
    setTransferData({ recipient: '', amount: '' })
    setReleaseData({ amount: '', reason: '' })
  }

  const handleAdminTransfer = async (tokenType) => {
    if (!supabase || !profile) {
      setMessage('Please wait for connection...')
      return
    }

    const recipient = transferData.recipient.trim().toUpperCase()
    const amount = parseFloat(transferData.amount)

    if (!recipient || !amount) {
      setMessage('Please fill in recipient and amount')
      return
    }

    const recipientProfile = allProfiles.find(p => p.username === recipient)
    if (!recipientProfile) {
      setMessage('Recipient not found')
      return
    }

    if (recipientProfile.id === user.id) {
      setMessage('Cannot send to yourself')
      return
    }

    const currentBalance = tokenType === 'DOV' ? profile.dov_balance : profile.djr_balance
    if (currentBalance < amount) {
      setMessage('Insufficient tokens')
      return
    }

    try {
      setIsTransferring(true)

      if (tokenType === 'DOV') {
        await supabase
          .from('profiles')
          .update({ dov_balance: profile.dov_balance - amount })
          .eq('id', user.id)

        await supabase
          .from('profiles')
          .update({ dov_balance: recipientProfile.dov_balance + amount })
          .eq('id', recipientProfile.id)
      } else {
        await supabase
          .from('profiles')
          .update({ djr_balance: profile.djr_balance - amount })
          .eq('id', user.id)

        await supabase
          .from('profiles')
          .update({ djr_balance: recipientProfile.djr_balance + amount })
          .eq('id', recipientProfile.id)
      }

      setMessage('Sent ' + amount + ' ' + tokenType + ' to ' + recipient + '!')
      setTransferData({ recipient: '', amount: '' })
      setShowSendForm(null)
      
      await ensureProfileExists(user)
      await loadAllProfiles()
    } catch (err) {
      setMessage('Transfer failed: ' + err.message)
    } finally {
      setIsTransferring(false)
    }
  }

  const handleRelease = async (tokenType) => {
    if (!supabase || !profile) {
      setMessage('Please wait for connection...')
      return
    }

    const amount = parseFloat(releaseData.amount)
    const reason = releaseData.reason.trim() || 'Token release'

    if (!amount) {
      setMessage('Please enter amount')
      return
    }

    const currentBalance = tokenType === 'DOV' ? profile.dov_balance : profile.djr_balance
    if (currentBalance < amount) {
      setMessage('Insufficient tokens')
      return
    }

    try {
      setIsReleasing(true)

      if (tokenType === 'DOV') {
        await supabase
          .from('profiles')
          .update({ dov_balance: profile.dov_balance - amount })
          .eq('id', user.id)
      } else {
        await supabase
          .from('profiles')
          .update({ djr_balance: profile.djr_balance - amount })
          .eq('id', user.id)
      }

      setMessage('Released ' + amount + ' ' + tokenType + '!')
      setReleaseData({ amount: '', reason: '' })
      setShowReleaseForm(null)
      
      await ensureProfileExists(user)
      await loadAllProfiles()
    } catch (err) {
      setMessage('Release failed: ' + err.message)
    } finally {
      setIsReleasing(false)
    }
  }

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num || 0)
  }

  const formatWalletAddress = (address) => {
    if (!address) return 'No wallet connected'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const isAdmin = profile?.username === 'JPR333'

  if (user && showSendForm) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5dc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '2rem 1rem'
      }}>
        <div style={{
          maxWidth: '400px',
          margin: '0 auto',
          textAlign: 'center'
        }}>
          <button
            onClick={() => setShowSendForm(null)}
            style={{
              position: 'absolute',
              top: '2rem',
              left: '2rem',
              background: 'rgba(255, 255, 255, 0.9)',
              border: 'none',
              borderRadius: '20px',
              padding: '0.5rem 1rem',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            ← Back
          </button>

          <h1 style={{
            fontSize: '3rem',
            color: '#d2691e',
            marginBottom: '2rem',
            fontWeight: 'normal'
          }}>
            Send {showSendForm}
          </h1>

          {message && (
            <div style={{
              padding: '1rem',
              marginBottom: '2rem',
              backgroundColor: message.includes('Sent') ? '#d4edda' : '#f8d7da',
              color: message.includes('Sent') ? '#155724' : '#721c24',
              borderRadius: '20px'
            }}>
              {message}
            </div>
          )}

          <div style={{ marginBottom: '2rem' }}>
            <input
              type="text"
              value={transferData.recipient}
              onChange={(e) => setTransferData({ ...transferData, recipient: e.target.value.toUpperCase() })}
              placeholder="Recipient Username (ABC123)"
              maxLength={6}
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1.2rem',
                border: '2px solid #d2691e',
                borderRadius: '25px',
                textAlign: 'center',
                marginBottom: '1rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <input
              type="number"
              value={transferData.amount}
              onChange={(e) => setTransferData({ ...transferData, amount: e.target.value })}
              placeholder="Amount"
              min="0"
              step="0.01"
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1.2rem',
                border: '2px solid #d2691e',
                borderRadius: '25px',
                textAlign: 'center',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            onClick={() => handleAdminTransfer(showSendForm)}
            disabled={isTransferring}
            style={{
              background: 'linear-gradient(45deg, #d2691e, #cd853f)',
              color: 'white',
              border: 'none',
              borderRadius: '25px',
              padding: '1rem 3rem',
              fontSize: '1.2rem',
              fontWeight: '500',
              cursor: 'pointer',
              opacity: isTransferring ? 0.5 : 1,
              boxShadow: '0 4px 15px rgba(210, 105, 30, 0.3)'
            }}
          >
            {isTransferring ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    )
  }

  if (user && showReleaseForm) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5dc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '2rem 1rem'
      }}>
        <div style={{
          maxWidth: '400px',
          margin: '0 auto',
          textAlign: 'center'
        }}>
          <button
            onClick={() => setShowReleaseForm(null)}
            style={{
              position: 'absolute',
              top: '2rem',
              left: '2rem',
              background: 'rgba(255, 255, 255, 0.9)',
              border: 'none',
              borderRadius: '20px',
              padding: '0.5rem 1rem',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            ← Back
          </button>

          <h1 style={{
            fontSize: '3rem',
            color: '#8b4513',
            marginBottom: '2rem',
            fontWeight: 'normal'
          }}>
            Release {showReleaseForm}
          </h1>

          {message && (
            <div style={{
              padding: '1rem',
              marginBottom: '2rem',
              backgroundColor: message.includes('Released') ? '#d4edda' : '#f8d7da',
              color: message.includes('Released') ? '#155724' : '#721c24',
              borderRadius: '20px'
            }}>
              {message}
            </div>
          )}

          <div style={{ marginBottom: '2rem' }}>
            <input
              type="number"
              value={releaseData.amount}
              onChange={(e) => setReleaseData({ ...releaseData, amount: e.target.value })}
              placeholder="Amount to Release"
              min="0"
              step="0.01"
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1.2rem',
                border: '2px solid #8b4513',
                borderRadius: '25px',
                textAlign: 'center',
                marginBottom: '1rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <input
              type="text"
              value={releaseData.reason}
              onChange={(e) => setReleaseData({ ...releaseData, reason: e.target.value })}
              placeholder="Reason (optional)"
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1.2rem',
                border: '2px solid #8b4513',
                borderRadius: '25px',
                textAlign: 'center',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            onClick={() => handleRelease(showReleaseForm)}
            disabled={isReleasing}
            style={{
              background: 'linear-gradient(45deg, #8b4513, #a0522d)',
              color: 'white',
              border: 'none',
              borderRadius: '25px',
              padding: '1rem 3rem',
              fontSize: '1.2rem',
              fontWeight: '500',
              cursor: 'pointer',
              opacity: isReleasing ? 0.5 : 1,
              boxShadow: '0 4px 15px rgba(139, 69, 19, 0.3)'
            }}
          >
            {isReleasing ? 'Releasing...' : 'Release'}
          </button>
        </div>
      </div>
    )
  }

  if (user) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5dc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '1rem',
        position: 'relative',
        maxWidth: '100vw',
        overflow: 'hidden'
      }}>
        <div style={{
          maxWidth: '100%',
          margin: '0 auto',
          textAlign: 'center'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
            padding: '0 0.5rem'
          }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.9)',
              borderRadius: '20px',
              padding: '0.5rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ fontWeight: '500' }}>
  {profile?.username} {isAdmin && '🕊️'}
</span>
            </div>

            {showSettings && (
              <div style={{
                position: 'absolute',
                top: '3rem',
                left: '0.5rem',
                right: '0.5rem',
                background: 'white',
                borderRadius: '15px',
                boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)',
                padding: '1rem',
                zIndex: 1000
              }}>
                {/* Wallet Input Component */}
                <WalletInput 
                  onWalletSave={handleWalletSave}
                  currentWallet={profile?.wallet_address}
                />
                
                <button
                  onClick={handleLogout}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'transparent',
                    color: '#ef4444',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  🚪 Logout
                </button>
              </div>
            )}
          </div>

          {message && (
            <div style={{
              padding: '1rem',
              marginBottom: '2rem',
              backgroundColor: message.includes('successful') || message.includes('Sent') || message.includes('Released') || message.includes('connected') ? '#d4edda' : 
                             message.includes('failed') ? '#f8d7da' : '#fff3cd',
              color: message.includes('successful') || message.includes('Sent') || message.includes('Released') || message.includes('connected') ? '#155724' : 
                     message.includes('failed') ? '#721c24' : '#856404',
              borderRadius: '15px',
              fontSize: '0.9rem'
            }}>
              {message}
            </div>
          )}

          <div style={{ marginBottom: '3rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🕊️</div>
            <h2 style={{
              fontSize: '2.8rem',
              color: '#d2691e',
              margin: '0 0 0.5rem 0',
              fontWeight: 'normal'
            }}>
              Palomas
            </h2>
            <div style={{
              background: 'rgba(255, 255, 255, 0.9)',
              borderRadius: '20px',
              padding: '0.75rem 1.5rem',
              display: 'inline-block',
              fontSize: '1.4rem',
              fontWeight: '500',
              color: '#8b4513',
              marginBottom: '1.5rem'
            }}>
              {formatNumber(profile?.dov_balance)}
            </div>
            <br />
            {isAdmin ? (
              <button
                onClick={() => setShowSendForm('DOV')}
                style={{
                  background: 'linear-gradient(45deg, #d2691e, #cd853f)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '0.8rem 2.5rem',
                  fontSize: '1.1rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(210, 105, 30, 0.3)',
                  width: '100%',
                  maxWidth: '200px'
                }}
              >
                Send
              </button>
            ) : (
              <button
                onClick={() => setShowReleaseForm('DOV')}
                style={{
                  background: 'linear-gradient(45deg, #8b4513, #a0522d)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '0.8rem 2.5rem',
                  fontSize: '1.1rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(139, 69, 19, 0.3)',
                  width: '100%',
                  maxWidth: '200px'
                }}
              >
                Release
              </button>
            )}
          </div>

          <div>
            <h2 style={{
              fontSize: '2.8rem',
              color: '#8b4513',
              margin: '0 0 0.5rem 0',
              fontWeight: 'normal'
            }}>
              Palomitas
            </h2>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🕊️</div>
            <div style={{
              background: 'rgba(255, 255, 255, 0.9)',
              borderRadius: '20px',
              padding: '0.75rem 1.5rem',
              display: 'inline-block',
              fontSize: '1.4rem',
              fontWeight: '500',
              color: '#8b4513',
              marginBottom: '1.5rem'
            }}>
              {formatNumber(profile?.djr_balance)}
            </div>
            <br />
            {isAdmin ? (
              <button
                onClick={() => setShowSendForm('DJR')}
                style={{
                  background: 'linear-gradient(45deg, #d2691e, #cd853f)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '25px',
                  padding: '1rem 3rem',
                  fontSize: '1.2rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(210, 105, 30, 0.3)'
                }}
              >
                Send
              </button>
            ) : (
              <button
                onClick={() => setShowReleaseForm('DJR')}
                style={{
                  background: 'linear-gradient(45deg, #8b4513, #a0522d)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '25px',
                  padding: '1rem 3rem',
                  fontSize: '1.2rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(139, 69, 19, 0.3)'
                }}
              >
                Release
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5dc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '25px',
        padding: '2rem',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center',
        boxShadow: '0 8px 25px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 'bold',
          margin: '0 0 0.5rem 0',
          color: '#d2691e'
        }}>
          GRAIL
        </h1>
        <p style={{ color: '#8b4513', margin: '0 0 2rem 0' }}>Token Exchange</p>

        <div style={{ display: 'flex', marginBottom: '1.5rem', borderRadius: '20px', overflow: 'hidden' }}>
          <button
            onClick={() => setActiveTab('login')}
            style={{
              flex: 1,
              padding: '1rem',
              backgroundColor: activeTab === 'login' ? '#d2691e' : '#f0f0f0',
              color: activeTab === 'login' ? 'white' : '#8b4513',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Login
          </button>
          <button
            onClick={() => setActiveTab('register')}
            style={{
              flex: 1,
              padding: '1rem',
              backgroundColor: activeTab === 'register' ? '#d2691e' : '#f0f0f0',
              color: activeTab === 'register' ? 'white' : '#8b4513',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Register
          </button>
        </div>

        {message && (
          <div style={{
            padding: '1rem',
            borderRadius: '15px',
            marginBottom: '1rem',
            backgroundColor: message.includes('successful') ? '#d4edda' : 
                           message.includes('failed') ? '#f8d7da' : '#fff3cd',
            color: message.includes('successful') ? '#155724' : 
                   message.includes('failed') ? '#721c24' : '#856404',
            fontSize: '0.9rem'
          }}>
            {message}
          </div>
        )}

        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="Email"
          style={{
            width: '100%',
            padding: '1rem',
            border: '2px solid #e0e0e0',
            borderRadius: '15px',
            marginBottom: '1rem',
            boxSizing: 'border-box',
            fontSize: '1rem',
            outline: 'none'
          }}
        />

        <input
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          placeholder="Password"
          style={{
            width: '100%',
            padding: '1rem',
            border: '2px solid #e0e0e0',
            borderRadius: '15px',
            marginBottom: '1rem',
            boxSizing: 'border-box',
            fontSize: '1rem',
            outline: 'none'
          }}
        />

        {activeTab === 'register' && (
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value.toUpperCase() })}
            placeholder="Username (ABC123)"
            maxLength={6}
            style={{
              width: '100%',
              padding: '1rem',
              border: '2px solid #e0e0e0',
              borderRadius: '15px',
              marginBottom: '1rem',
              boxSizing: 'border-box',
              fontSize: '1rem',
              outline: 'none'
            }}
          />
        )}

        <button 
          onClick={activeTab === 'login' ? handleLogin : handleRegister}
          disabled={loading || !supabase}
          style={{
            width: '100%',
            padding: '1rem',
            background: 'linear-gradient(45deg, #d2691e, #cd853f)',
            color: 'white',
            border: 'none',
            borderRadius: '15px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '1rem',
            opacity: (loading || !supabase) ? 0.5 : 1,
            boxShadow: '0 4px 15px rgba(210, 105, 30, 0.3)'
          }}
        >
          {loading ? 'Loading...' : (activeTab === 'login' ? 'Login' : 'Register')}
        </button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
