import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import WalletInput from './WalletInput'

function HanglightApp() {
  const [supabase, setSupabase] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [activeTab, setActiveTab] = useState('login')
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: ''
  })
  const [addFriendData, setAddFriendData] = useState({
    identifier: '', // email or username
    message: ''
  })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
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
          await loadFriends(client)
          await loadFriendRequests(client)
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
        // Update existing profile to mark as hanglight active
        const { data: updatedProfile, error: updateError } = await client
          .from('profiles')
          .update({ 
            hanglight_active: true,
            status_light: existingProfile.status_light || 'red'
          })
          .eq('id', authUser.id)
          .select()
          .single()

        if (updateError) {
          console.error('Error updating profile:', updateError)
          setProfile(existingProfile)
        } else {
          setProfile(updatedProfile)
        }
        return existingProfile
      }

      // Only create new profile if doesn't exist (new user)
      const username = authUser.user_metadata?.username || 'TEMP' + Math.random().toString(36).substr(2, 3).toUpperCase()
      
      const newProfile = {
        id: authUser.id,
        username: username,
        email: authUser.email,
        status_light: 'red',
        hanglight_active: true,
        dov_balance: 0,
        djr_balance: 0
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
      setMessage('Welcome to Hanglight!')
      return createdProfile
    } catch (error) {
      setMessage('Error creating profile: ' + error.message)
      return null
    }
  }

  const loadFriends = async (client = supabase) => {
    if (!user) return
    try {
      // Get accepted friends
      const { data: friendsData, error: friendsError } = await client.rpc('get_user_friends', { user_uuid: user.id })
      if (friendsError) throw friendsError

      // Get pending friend requests where user is the receiver
      const { data: requestsData, error: requestsError } = await client
        .from('friend_requests')
        .select(`
          id,
          message,
          created_at,
          sender:profiles!sender_id(id, username, email, status_light, last_status_update)
        `)
        .eq('receiver_id', user.id)
        .eq('status', 'pending')
      
      if (requestsError) throw requestsError

      // Combine friends and pending requests
      const allItems = [
        ...(friendsData || []).map(friend => ({ ...friend, type: 'friend' })),
        ...(requestsData || []).map(request => ({
          friend_id: request.sender.id,
          username: request.sender.username,
          email: request.sender.email,
          status_light: request.sender.status_light || 'red',
          last_status_update: request.sender.last_status_update,
          friendship_created_at: request.created_at,
          request_id: request.id,
          request_message: request.message,
          type: 'request'
        }))
      ]

      setFriends(allItems)
    } catch (error) {
      console.error('Error loading friends:', error)
    }
  }

  const loadFriendRequests = async (client = supabase) => {
    // This function is now handled in loadFriends() - keeping for compatibility
    return
  }

  const updateStatusLight = async (newStatus) => {
    if (!supabase || !user) return
    
    setIsUpdatingStatus(true)
    try {
      const { error } = await supabase.rpc('update_status_light', {
        user_uuid: user.id,
        new_status: newStatus
      })

      if (error) throw error

      await ensureProfileExists(user)
      setMessage(`Status updated to ${newStatus}! 🚦`)
    } catch (error) {
      setMessage('Failed to update status: ' + error.message)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const sendFriendRequest = async () => {
    if (!supabase || !user) return

    const identifier = addFriendData.identifier.trim()
    if (!identifier) {
      setMessage('Please enter an email or username')
      return
    }

    try {
      setLoading(true)

      // Find user by email or username
      const { data: targetUser, error: findError } = await supabase
        .from('profiles')
        .select('id, username, email')
        .or(`email.eq.${identifier},username.eq.${identifier.toUpperCase()}`)
        .single()

      if (findError || !targetUser) {
        setMessage('User not found')
        return
      }

      if (targetUser.id === user.id) {
        setMessage("You can't add yourself!")
        return
      }

      // Check if already friends or request exists
      const { data: existingFriendship } = await supabase
        .from('friendships')
        .select('*')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${targetUser.id}),and(user_id.eq.${targetUser.id},friend_id.eq.${user.id})`)
        .single()

      if (existingFriendship) {
        setMessage('Already friends!')
        return
      }

      const { data: existingRequest } = await supabase
        .from('friend_requests')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUser.id}),and(sender_id.eq.${targetUser.id},receiver_id.eq.${user.id})`)
        .eq('status', 'pending')
        .single()

      if (existingRequest) {
        setMessage('Friend request already sent!')
        return
      }

      // Send friend request
      const { error: requestError } = await supabase
        .from('friend_requests')
        .insert([{
          sender_id: user.id,
          receiver_id: targetUser.id,
          message: addFriendData.message.trim() || 'Hi! Let\'s be friends on Hanglight!'
        }])

      if (requestError) throw requestError

      setMessage(`Friend request sent to ${targetUser.username}!`)
      setAddFriendData({ identifier: '', message: '' })
      setShowAddFriend(false)
      await loadFriends()
    } catch (error) {
      setMessage('Error sending friend request: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const respondToFriendRequest = async (requestId, response) => {
    if (!supabase) return

    try {
      setLoading(true)

      if (response === 'accepted') {
        // Get the request details
        const { data: request } = await supabase
          .from('friend_requests')
          .select('sender_id, receiver_id')
          .eq('id', requestId)
          .single()

        if (request) {
          // Create friendship
          await supabase
            .from('friendships')
            .insert([{
              user_id: request.sender_id,
              friend_id: request.receiver_id,
              status: 'accepted'
            }])
        }
      }

      // Update request status
      await supabase
        .from('friend_requests')
        .update({ status: response })
        .eq('id', requestId)

      await loadFriends()
      setMessage(`Friend request ${response}!`)
    } catch (error) {
      setMessage('Error responding to request: ' + error.message)
    } finally {
      setLoading(false)
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
        await loadFriends()
        setMessage('Welcome to Hanglight!')
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

      setMessage('Login successful!')
      setUser(data.user)
      await ensureProfileExists(data.user)
      await loadFriends()
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
    setFriends([])
    setFriendRequests([])
    setShowAddFriend(false)
    setShowSettings(false)
    setMessage('')
    setFormData({ email: '', password: '', username: '' })
    setAddFriendData({ identifier: '', message: '' })
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'green': return '#28a745'
      case 'yellow': return '#ffc107'
      case 'red': return '#dc3545'
      default: return '#6c757d'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'green': return 'Down to hang!'
      case 'yellow': return 'Maybe...'
      case 'red': return 'Not available'
      default: return 'Unknown'
    }
  }

  const formatTimeAgo = (timestamp) => {
    const now = new Date()
    const time = new Date(timestamp)
    const diffInMinutes = Math.floor((now - time) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return `${Math.floor(diffInMinutes / 1440)}d ago`
  }

  // Add Friend Modal
  if (user && showAddFriend) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#1a1a1a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '1rem',
        color: 'white'
      }}>
        <div style={{
          maxWidth: '100%',
          margin: '0 auto',
          textAlign: 'center'
        }}>
          <button
            onClick={() => setShowAddFriend(false)}
            style={{
              position: 'absolute',
              top: '1rem',
              left: '1rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '15px',
              padding: '0.5rem 1rem',
              fontSize: '1rem',
              cursor: 'pointer',
              color: 'white'
            }}
          >
            ← Back
          </button>

          <h1 style={{
            fontSize: '2rem',
            color: 'white',
            marginBottom: '2rem',
            fontWeight: 'normal'
          }}>
            Add Friend
          </h1>

          {message && (
            <div style={{
              padding: '1rem',
              marginBottom: '2rem',
              backgroundColor: message.includes('sent') ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)',
              color: message.includes('sent') ? '#90ee90' : '#ffcccb',
              borderRadius: '15px'
            }}>
              {message}
            </div>
          )}

          <div style={{ marginBottom: '2rem' }}>
            <input
              type="text"
              value={addFriendData.identifier}
              onChange={(e) => setAddFriendData({ ...addFriendData, identifier: e.target.value })}
              placeholder="Email or Username (ABC123)"
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1.1rem',
                border: '2px solid #333',
                borderRadius: '15px',
                textAlign: 'center',
                marginBottom: '1rem',
                outline: 'none',
                boxSizing: 'border-box',
                backgroundColor: '#2a2a2a',
                color: 'white'
              }}
            />

            <input
              type="text"
              value={addFriendData.message}
              onChange={(e) => setAddFriendData({ ...addFriendData, message: e.target.value })}
              placeholder="Message (optional)"
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1.1rem',
                border: '2px solid #333',
                borderRadius: '15px',
                textAlign: 'center',
                outline: 'none',
                boxSizing: 'border-box',
                backgroundColor: '#2a2a2a',
                color: 'white'
              }}
            />
          </div>

          <button
            onClick={sendFriendRequest}
            disabled={loading}
            style={{
              background: 'linear-gradient(45deg, #28a745, #20c997)',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              padding: '0.8rem 2.5rem',
              fontSize: '1.1rem',
              fontWeight: '500',
              cursor: 'pointer',
              opacity: loading ? 0.5 : 1,
              boxShadow: '0 4px 15px rgba(40, 167, 69, 0.3)',
              width: '100%',
              maxWidth: '200px'
            }}
          >
            {loading ? 'Sending...' : 'Send Request'}
          </button>
        </div>
      </div>
    )
  }

  // Main App
  if (user) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#1a1a1a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '1rem',
        position: 'relative',
        maxWidth: '100vw',
        overflow: 'hidden',
        color: 'white'
      }}>
        <div style={{
          maxWidth: '100%',
          margin: '0 auto',
          textAlign: 'center'
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
            padding: '0 0.5rem'
          }}>
            <div 
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '15px',
                padding: '0.5rem 1rem',
                cursor: 'pointer'
              }}
              onClick={() => setShowSettings(!showSettings)}
            >
              <span style={{ fontWeight: '500' }}>
                {profile?.username}
              </span>
            </div>

            {showSettings && (
              <div style={{
                position: 'absolute',
                top: '3rem',
                left: '0.5rem',
                right: '0.5rem',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '15px',
                boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)',
                padding: '1rem',
                zIndex: 1000,
                backdropFilter: 'blur(10px)'
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
                    backgroundColor: 'rgba(220, 53, 69, 0.2)',
                    color: '#ffcccb',
                    border: '1px solid #dc3545',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  🚪 Logout
                </button>
              </div>
            )}

            <button
              onClick={handleLogout}
              style={{
                background: 'rgba(220, 53, 69, 0.2)',
                color: '#ffcccb',
                border: '1px solid #dc3545',
                borderRadius: '10px',
                padding: '0.5rem 1rem',
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: showSettings ? 'none' : 'block'
              }}
            >
              Logout
            </button>
          </div>

          {/* Status Messages */}
          {message && (
            <div style={{
              padding: '1rem',
              marginBottom: '1.5rem',
              backgroundColor: message.includes('successful') || message.includes('sent') || message.includes('updated') ? 'rgba(40, 167, 69, 0.2)' : 
                             message.includes('failed') || message.includes('Error') ? 'rgba(220, 53, 69, 0.2)' : 'rgba(255, 193, 7, 0.2)',
              color: message.includes('successful') || message.includes('sent') || message.includes('updated') ? '#90ee90' : 
                     message.includes('failed') || message.includes('Error') ? '#ffcccb' : '#fff3cd',
              borderRadius: '15px',
              fontSize: '0.9rem'
            }}>
              {message}
            </div>
          )}

          {/* Status Light Picker */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{
              fontSize: '1.5rem',
              color: 'white',
              margin: '0 0 1rem 0',
              fontWeight: 'normal'
            }}>
              Your Status
            </h2>
            
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              {['red', 'yellow', 'green'].map(status => (
                <button
                  key={status}
                  onClick={() => updateStatusLight(status)}
                  disabled={isUpdatingStatus}
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    border: profile?.status_light === status ? '3px solid white' : '2px solid #333',
                    backgroundColor: getStatusColor(status),
                    cursor: 'pointer',
                    opacity: isUpdatingStatus ? 0.5 : 1,
                    boxShadow: profile?.status_light === status ? '0 0 20px rgba(255,255,255,0.5)' : 'none'
                  }}
                />
              ))}
            </div>
            
            <div style={{ 
              fontSize: '0.9rem', 
              color: '#ccc',
              marginBottom: '1rem'
            }}>
              {getStatusText(profile?.status_light)}
            </div>
          </div>

          {/* Add Friend Button */}
          <button
            onClick={() => setShowAddFriend(true)}
            style={{
              background: 'linear-gradient(45deg, #007bff, #0056b3)',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              padding: '0.8rem 2rem',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer',
              marginBottom: '2rem',
              boxShadow: '0 4px 15px rgba(0, 123, 255, 0.3)'
            }}
          >
            + Add Friend
          </button>

          {/* Friend Requests - Now removed since they're inline */}

          {/* Friends List */}
          <div>
            <h3 style={{ 
              fontSize: '1.2rem', 
              color: 'white', 
              marginBottom: '1rem',
              fontWeight: 'normal'
            }}>
              Friends ({friends.filter(f => f.type === 'friend').length})
            </h3>
            
            {friends.length === 0 ? (
              <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '15px',
                padding: '2rem',
                color: '#ccc'
              }}>
                No friends yet. Add some friends to see their status!
              </div>
            ) : (
              friends.map(friend => (
                <div key={friend.friend_id} style={{
                  background: friend.type === 'request' ? 'rgba(255, 193, 7, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                  border: friend.type === 'request' ? '1px solid #ffc107' : 'none',
                  borderRadius: '15px',
                  padding: '1rem',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    marginBottom: friend.type === 'request' ? '0.5rem' : '0'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: getStatusColor(friend.status_light)
                        }}
                      />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: '500' }}>
                          {friend.username}
                          {friend.type === 'request' && (
                            <span style={{ 
                              fontSize: '0.7rem', 
                              color: '#ffc107',
                              marginLeft: '0.5rem'
                            }}>
                              • Friend Request
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
                          {friend.type === 'request' ? 'Wants to be friends!' : getStatusText(friend.status_light)}
                        </div>
                      </div>
                    </div>
                    
                    {friend.type === 'request' ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => respondToFriendRequest(friend.request_id, 'accepted')}
                          style={{
                            background: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.4rem 0.8rem',
                            fontSize: '0.7rem',
                            cursor: 'pointer'
                          }}
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => respondToFriendRequest(friend.request_id, 'declined')}
                          style={{
                            background: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.4rem 0.8rem',
                            fontSize: '0.7rem',
                            cursor: 'pointer'
                          }}
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.7rem', color: '#999' }}>
                        {formatTimeAgo(friend.last_status_update)}
                      </div>
                    )}
                  </div>
                  
                  {friend.type === 'request' && friend.request_message && (
                    <div style={{ 
                      fontSize: '0.8rem', 
                      color: '#ccc', 
                      fontStyle: 'italic',
                      marginTop: '0.5rem',
                      paddingLeft: '2rem'
                    }}>
                      "{friend.request_message}"
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  // Login/Register Screen
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#1a1a1a',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '25px',
        padding: '2rem',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center',
        boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)',
        color: 'white'
      }}>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 'bold',
          margin: '0 0 0.5rem 0',
          color: 'white'
        }}>
          Hanglight
        </h1>
        <p style={{ color: '#ccc', margin: '0 0 2rem 0' }}>Status lights for friends</p>

        <div style={{ display: 'flex', marginBottom: '1.5rem', borderRadius: '20px', overflow: 'hidden' }}>
          <button
            onClick={() => setActiveTab('login')}
            style={{
              flex: 1,
              padding: '1rem',
              backgroundColor: activeTab === 'login' ? '#28a745' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
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
              backgroundColor: activeTab === 'register' ? '#28a745' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
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
            backgroundColor: message.includes('successful') || message.includes('Welcome') ? 'rgba(40, 167, 69, 0.2)' : 
                           message.includes('failed') ? 'rgba(220, 53, 69, 0.2)' : 'rgba(255, 193, 7, 0.2)',
            color: message.includes('successful') || message.includes('Welcome') ? '#90ee90' : 
                   message.includes('failed') ? '#ffcccb' : '#fff3cd',
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
            border: '2px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '15px',
            marginBottom: '1rem',
            boxSizing: 'border-box',
            fontSize: '1rem',
            outline: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: 'white'
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
            border: '2px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '15px',
            marginBottom: '1rem',
            boxSizing: 'border-box',
            fontSize: '1rem',
            outline: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: 'white'
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
              border: '2px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '15px',
              marginBottom: '1rem',
              boxSizing: 'border-box',
              fontSize: '1rem',
              outline: 'none',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'white'
            }}
          />
        )}

        <button 
          onClick={activeTab === 'login' ? handleLogin : handleRegister}
          disabled={loading || !supabase}
          style={{
            width: '100%',
            padding: '1rem',
            background: 'linear-gradient(45deg, #28a745, #20c997)',
            color: 'white',
            border: 'none',
            borderRadius: '15px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '1rem',
            opacity: (loading || !supabase) ? 0.5 : 1,
            boxShadow: '0 4px 15px rgba(40, 167, 69, 0.3)'
          }}
        >
          {loading ? 'Loading...' : (activeTab === 'login' ? 'Login' : 'Register')}
        </button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<HanglightApp />)
