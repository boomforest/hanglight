import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import WalletInput from './WalletInput'

function HanglightApp() {
  const [supabase, setSupabase] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [activeTab, setActiveTab] = useState('login')
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [pendingRequests, setPendingRequests] = useState([])
  const [friends, setFriends] = useState([])
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: ''
  })
  const [addFriendData, setAddFriendData] = useState({
    identifier: '',
    message: ''
  })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  
  // New state for nickname functionality
  const [editingNickname, setEditingNickname] = useState(null)
  const [nicknameInput, setNicknameInput] = useState('')

  // Handle wallet address save
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

  const formatWalletAddress = (address) => {
    if (!address) return 'No wallet connected'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Helper function to load user data after authentication
  const loadUserData = async (authUser, client = supabase) => {
    try {
      console.log('=== LOADING USER DATA ===')
      console.log('Loading data for user:', authUser.id)
      
      // First ensure profile exists
      const profile = await ensureProfileExists(authUser, client)
      if (!profile) {
        console.error('Failed to create/load profile')
        return
      }

      // Then load friends and requests in parallel
      const [friendsResult, requestsResult] = await Promise.allSettled([
        loadFriends(client, authUser),
        loadPendingRequests(client, authUser)
      ])

      if (friendsResult.status === 'rejected') {
        console.error('Failed to load friends:', friendsResult.reason)
      }
      if (requestsResult.status === 'rejected') {
        console.error('Failed to load requests:', requestsResult.reason)
      }

      console.log('User data loading complete')
    } catch (error) {
      console.error('Error in loadUserData:', error)
    }
  }

  useEffect(() => {
    console.log('=== SUPABASE INIT STARTING ===')
    const initSupabase = async () => {
      try {
        console.log('Creating Supabase client...')
        const { createClient } = await import('@supabase/supabase-js')
        const client = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY
        )
        setSupabase(client)
        setMessage('')
        console.log('Supabase client created successfully')

        console.log('Getting session...')
        const { data: { session } } = await client.auth.getSession()
        console.log('Session:', session)
        
        if (session?.user) {
          console.log('User found in session:', session.user)
          setUser(session.user)
          
          // Load all user data
          await loadUserData(session.user, client)
        } else {
          console.log('No user in session')
        }

        // Set up auth state change listener
        const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
          console.log('Auth state change:', event, session?.user?.id)
          
          if (event === 'SIGNED_IN' && session?.user) {
            setUser(session.user)
            await loadUserData(session.user, client)
          } else if (event === 'SIGNED_OUT') {
            setUser(null)
            setProfile(null)
            setPendingRequests([])
            setFriends([])
            setStatusMessage('')
          }
        })

        // Cleanup subscription on unmount
        return () => {
          subscription?.unsubscribe()
        }
      } catch (error) {
        console.error('Supabase init error:', error)
        setMessage('Connection failed')
      }
    }
    initSupabase()
  }, [])

  const ensureProfileExists = async (authUser, client = supabase) => {
    try {
      console.log('=== PROFILE DEBUG ===')
      console.log('Auth user:', authUser)
      console.log('Auth user ID:', authUser.id)
      console.log('Auth user email:', authUser.email)
      
      const { data: existingProfile } = await client
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      console.log('Existing profile found:', existingProfile)

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
          console.log('Profile updated:', updatedProfile)
          setProfile(updatedProfile)
        }
        
        // Set status message state
        setStatusMessage(existingProfile.status_message || '')
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
        djr_balance: 0,
        status_message: '',
        last_status_update: new Date().toISOString()
      }

      console.log('Creating new profile:', newProfile)

      const { data: createdProfile, error: createError } = await client
        .from('profiles')
        .insert([newProfile])
        .select()
        .single()

      if (createError) {
        console.error('Profile creation error:', createError)
        setMessage('Profile creation failed: ' + createError.message)
        return null
      }

      console.log('New profile created:', createdProfile)
      setProfile(createdProfile)
      setMessage('Welcome to Hanglight!')
      return createdProfile
    } catch (error) {
      console.error('Error in ensureProfileExists:', error)
      setMessage('Error creating profile: ' + error.message)
      return null
    }
  }

  const loadPendingRequests = async (client = supabase, userParam = null) => {
    console.log('=== LOADING PENDING REQUESTS ===')
    const currentUser = userParam || user
    console.log('User check:', currentUser)
    console.log('Client check:', client)
    
    if (!currentUser || !client) {
      console.log('No user or client, returning early')
      return
    }
    
    console.log('User ID:', currentUser.id)
    
    try {
      console.log('Querying for friend requests...')
      
      // Query for this specific user's requests
      const { data, error } = await client
        .from('friend_requests')
        .select(`
          id,
          message,
          created_at,
          sender_id,
          receiver_id,
          status,
          sender:profiles!sender_id(username, email)
        `)
        .eq('receiver_id', currentUser.id)
        .eq('status', 'pending')
      
      console.log('Friend requests data:', data)
      console.log('Friend requests error:', error)
      
      if (error) {
        console.error('Database error:', error)
        setPendingRequests([])
        return
      }
      
      if (data && data.length > 0) {
        console.log('Found', data.length, 'friend requests')
        setPendingRequests(data)
      } else {
        console.log('No friend requests found')
        setPendingRequests([])
      }
      
    } catch (error) {
      console.error('Error in loadPendingRequests:', error)
      setPendingRequests([])
    }
  }

  const loadFriends = async (client = supabase, userParam = null) => {
    console.log('=== LOADING FRIENDS ===')
    const currentUser = userParam || user
    
    if (!currentUser || !client) {
      console.log('No user or client for loading friends')
      return
    }
    
    try {
      console.log('Loading friends for user:', currentUser.id)
      
      // First check for expired messages
      await checkExpiredMessages(client)
      
      // Get accepted friends from friendships table - check BOTH directions
      // Updated to include nickname field
      const { data: friendsData1, error: friendsError1 } = await client
        .from('friendships')
        .select(`
          *,
          friend_profile:profiles!friend_id(id, username, email, status_light, status_message, last_status_update)
        `)
        .eq('user_id', currentUser.id)
        .eq('status', 'accepted')
      
      const { data: friendsData2, error: friendsError2 } = await client
        .from('friendships')
        .select(`
          *,
          user_profile:profiles!user_id(id, username, email, status_light, status_message, last_status_update)
        `)
        .eq('friend_id', currentUser.id)
        .eq('status', 'accepted')
      
      console.log('Friends data (user_id direction):', friendsData1)
      console.log('Friends data (friend_id direction):', friendsData2)
      console.log('Friends errors:', friendsError1, friendsError2)

      if (friendsError1 || friendsError2) {
        console.error('Friends error:', friendsError1, friendsError2)
        setFriends([])
        return
      }

      // Combine both directions and format friends data
      const allFriends = [
        ...(friendsData1 || []).map(friendship => ({
          friendship_id: friendship.id, // Add friendship_id for nickname updates
          friend_id: friendship.friend_profile?.id || friendship.friend_id,
          username: friendship.friend_profile?.username || 'Unknown',
          email: friendship.friend_profile?.email || '',
          status_light: friendship.friend_profile?.status_light || 'red',
          status_message: friendship.friend_profile?.status_message || '',
          last_status_update: friendship.friend_profile?.last_status_update,
          friendship_created_at: friendship.created_at,
          nickname: friendship.nickname // Include nickname from friendships table
        })),
        ...(friendsData2 || []).map(friendship => ({
          friendship_id: friendship.id, // Add friendship_id for nickname updates
          friend_id: friendship.user_profile?.id || friendship.user_id,
          username: friendship.user_profile?.username || 'Unknown',
          email: friendship.user_profile?.email || '',
          status_light: friendship.user_profile?.status_light || 'red',
          status_message: friendship.user_profile?.status_message || '',
          last_status_update: friendship.user_profile?.last_status_update,
          friendship_created_at: friendship.created_at,
          nickname: friendship.nickname // Include nickname from friendships table
        }))
      ]

      console.log('All combined friends:', allFriends)
      console.log('Final friends count:', allFriends.length)
      setFriends(allFriends)
    } catch (error) {
      console.error('Error loading friends:', error)
      setFriends([])
    }
  }

  // New function to update nickname
  const updateNickname = async (friendshipId, newNickname) => {
    if (!supabase || !user) return

    try {
      const { error } = await supabase
        .from('friendships')
        .update({ nickname: newNickname.trim() || null })
        .eq('id', friendshipId)

      if (error) throw error

      // Reload friends to show updated nickname
      await loadFriends()
      setEditingNickname(null)
      setNicknameInput('')
      setMessage('Nickname updated!')
    } catch (error) {
      console.error('Error updating nickname:', error)
      setMessage('Failed to update nickname: ' + error.message)
    }
  }

  // Function to start editing nickname
  const startEditingNickname = (friend) => {
    setEditingNickname(friend.friendship_id)
    setNicknameInput(friend.nickname || friend.username)
  }

  // Function to cancel editing nickname
  const cancelEditingNickname = () => {
    setEditingNickname(null)
    setNicknameInput('')
  }

  const updateStatusLight = async (newStatus) => {
    if (!supabase || !user) return
    
    setIsUpdatingStatus(true)
    try {
      // Update status light and last_status_update timestamp
      const { error } = await supabase
        .from('profiles')
        .update({ 
          status_light: newStatus,
          last_status_update: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) throw error

      await ensureProfileExists(user)
    } catch (error) {
      setMessage('Failed to update status: ' + error.message)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const updateStatusMessage = async (message) => {
    if (!supabase || !user) return
    
    try {
      // Update status message and timestamp using last_status_update instead of status_message_updated_at
      const { error } = await supabase
        .from('profiles')
        .update({ 
          status_message: message,
          last_status_update: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) throw error

      await ensureProfileExists(user)
    } catch (error) {
      setMessage('Failed to update status message: ' + error.message)
    }
  }

  // Check and clear expired status messages (using last_status_update instead of status_message_updated_at)
  const checkExpiredMessages = async (client = supabase) => {
    if (!client) return
    
    try {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
      
      const { error } = await client
        .from('profiles')
        .update({ status_message: null })
        .lt('last_status_update', twelveHoursAgo)
        .not('status_message', 'is', null)

      if (error) {
        console.error('Error clearing expired messages:', error)
      }
    } catch (error) {
      console.error('Error in checkExpiredMessages:', error)
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
      console.log('Searching for user:', identifier)

      // Find user by email or username
      let targetUser = null
      
      // First try exact email match
      const { data: emailMatch } = await supabase
        .from('profiles')
        .select('id, username, email')
        .eq('email', identifier)
        .maybeSingle()
      
      if (emailMatch) {
        targetUser = emailMatch
      } else {
        // Try username match
        const { data: usernameMatch } = await supabase
          .from('profiles')
          .select('id, username, email')
          .ilike('username', identifier)
          .maybeSingle()
        
        if (usernameMatch) {
          targetUser = usernameMatch
        }
      }

      if (!targetUser) {
        setMessage('User not found')
        return
      }

      if (targetUser.id === user.id) {
        setMessage("You can't add yourself!")
        return
      }

      // Check if already friends
      const { data: existingFriendship } = await supabase
        .from('friendships')
        .select('*')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${targetUser.id}),and(user_id.eq.${targetUser.id},friend_id.eq.${user.id})`)
        .maybeSingle()

      if (existingFriendship) {
        setMessage('Already friends!')
        return
      }

      // Check if any request already exists (pending, accepted, or declined)
      const { data: existingRequest } = await supabase
        .from('friend_requests')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUser.id}),and(sender_id.eq.${targetUser.id},receiver_id.eq.${user.id})`)
        .maybeSingle()

      if (existingRequest) {
        if (existingRequest.status === 'pending') {
          setMessage('Friend request already sent!')
        } else if (existingRequest.status === 'accepted') {
          setMessage('You are already friends!')
        } else if (existingRequest.status === 'declined') {
          setMessage('Previous request was declined')
        }
        return
      }

      // Send friend request
      const { error: requestError } = await supabase
        .from('friend_requests')
        .insert([{
          sender_id: user.id,
          receiver_id: targetUser.id,
          message: addFriendData.message.trim() || 'Hi! Let\'s be friends on Hanglight!',
          status: 'pending'
        }])

      if (requestError) throw requestError

      setMessage(`Friend request sent to ${targetUser.username}!`)
      setAddFriendData({ identifier: '', message: '' })
      setShowAddFriend(false)
      await loadPendingRequests()
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
        const { data: request, error: requestError } = await supabase
          .from('friend_requests')
          .select('sender_id, receiver_id')
          .eq('id', requestId)
          .single()

        console.log('Request details:', request)
        console.log('Request error:', requestError)

        if (request && !requestError) {
          // Create friendship
          const { data: friendshipData, error: friendshipError } = await supabase
            .from('friendships')
            .insert([{
              user_id: request.sender_id,
              friend_id: request.receiver_id,
              status: 'accepted'
            }])
            .select()

          console.log('Friendship created:', friendshipData)
          console.log('Friendship error:', friendshipError)

          if (friendshipError) {
            console.error('Failed to create friendship:', friendshipError)
            setMessage('Error creating friendship: ' + friendshipError.message)
            return
          }
        }
      }

      // Update request status
      const { error: updateError } = await supabase
        .from('friend_requests')
        .update({ status: response })
        .eq('id', requestId)

      console.log('Request update error:', updateError)

      if (updateError) {
        console.error('Failed to update request:', updateError)
        setMessage('Error updating request: ' + updateError.message)
        return
      }

      // Reload data after accepting/declining
      await Promise.all([
        loadPendingRequests(),
        loadFriends()
      ])
      
      setMessage(`Friend request ${response}!`)
    } catch (error) {
      console.error('Error responding to request:', error)
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
      
      // The auth state change listener will handle loading user data
      setFormData({ email: '', password: '', username: '' })
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
      console.log('=== LOGIN STARTING ===')
      console.log('Email:', formData.email)

      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      })

      if (error) {
        console.error('Login error:', error)
        setMessage('Login failed: ' + error.message)
        return
      }

      console.log('Login successful, user:', data.user)
      setMessage('Login successful!')
      
      // The auth state change listener will handle loading user data
      setFormData({ email: '', password: '', username: '' })
    } catch (err) {
      console.error('Login catch error:', err)
      setMessage('Login error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    // Auth state change listener will handle clearing state
    setShowAddFriend(false)
    setShowMenu(false)
    setMessage('')
    setFormData({ email: '', password: '', username: '' })
    setAddFriendData({ identifier: '', message: '' })
    setEditingNickname(null)
    setNicknameInput('')
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
    if (!timestamp) return 'Recently'
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
        backgroundColor: '#f5f1e8',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '2rem 1rem',
        color: '#8b5a3c'
      }}>
        <div style={{
          maxWidth: '400px',
          margin: '0 auto',
          textAlign: 'center'
        }}>
          <button
            onClick={() => setShowAddFriend(false)}
            style={{
              position: 'absolute',
              top: '2rem',
              left: '2rem',
              background: 'rgba(210, 105, 30, 0.1)',
              border: '1px solid rgba(210, 105, 30, 0.3)',
              borderRadius: '20px',
              padding: '0.8rem 1.5rem',
              fontSize: '1rem',
              cursor: 'pointer',
              color: '#d2691e',
              fontWeight: '500'
            }}
          >
            ← Back
          </button>

          <div style={{
            background: 'linear-gradient(135deg, #d2691e, #cd853f, #daa520)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontSize: '2.5rem',
            fontWeight: '400',
            marginBottom: '3rem',
            marginTop: '2rem'
          }}>
            Add Friend
          </div>

          {message && (
            <div style={{
              padding: '1rem',
              marginBottom: '2rem',
              backgroundColor: message.includes('sent') ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)',
              color: message.includes('sent') ? '#28a745' : '#dc3545',
              borderRadius: '16px',
              border: `1px solid ${message.includes('sent') ? 'rgba(40, 167, 69, 0.3)' : 'rgba(220, 53, 69, 0.3)'}`
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
                padding: '1.2rem',
                fontSize: '1.1rem',
                border: '1px solid rgba(210, 105, 30, 0.3)',
                borderRadius: '16px',
                textAlign: 'center',
                marginBottom: '1rem',
                outline: 'none',
                boxSizing: 'border-box',
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                color: '#8b5a3c'
              }}
            />

            <input
              type="text"
              value={addFriendData.message}
              onChange={(e) => setAddFriendData({ ...addFriendData, message: e.target.value })}
              placeholder="Message (optional)"
              style={{
                width: '100%',
                padding: '1.2rem',
                fontSize: '1.1rem',
                border: '1px solid rgba(210, 105, 30, 0.3)',
                borderRadius: '16px',
                textAlign: 'center',
                outline: 'none',
                boxSizing: 'border-box',
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                color: '#8b5a3c'
              }}
            />
          </div>

          <button
            onClick={sendFriendRequest}
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #d2691e, #cd853f)',
              color: 'white',
              border: 'none',
              borderRadius: '24px',
              padding: '1rem 3rem',
              fontSize: '1.1rem',
              fontWeight: '500',
              cursor: 'pointer',
              opacity: loading ? 0.5 : 1,
              boxShadow: '0 4px 20px rgba(210, 105, 30, 0.3)',
              width: '100%',
              maxWidth: '200px'
            }}
          >
            {loading ? 'Sending...' : 'Send'}
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
        backgroundColor: '#f5f1e8',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '2rem 1rem',
        position: 'relative',
        maxWidth: '100vw',
        overflow: 'hidden',
        color: '#8b5a3c'
      }}>
        <div style={{
          maxWidth: '600px',
          margin: '0 auto',
          textAlign: 'center'
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '3rem',
            padding: '0 0.5rem'
          }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.6)',
              borderRadius: '20px',
              padding: '0.8rem 1.5rem',
              border: '1px solid rgba(210, 105, 30, 0.2)'
            }}>
              <span style={{ fontWeight: '500', color: '#8b5a3c' }}>
                {profile?.username}
              </span>
            </div>

            {/* Menu button */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(210, 105, 30, 0.2)',
                  borderRadius: '16px',
                  padding: '0.8rem',
                  cursor: 'pointer',
                  color: '#8b5a3c',
                  fontSize: '1.2rem',
                  width: '45px',
                  height: '45px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ☰
              </button>

              {showMenu && (
                <div style={{
                  position: 'absolute',
                  top: '3.5rem',
                  right: '0',
                  background: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '20px',
                  boxShadow: '0 8px 30px rgba(139, 90, 60, 0.15)',
                  padding: '1.5rem',
                  zIndex: 1000,
                  minWidth: '320px',
                  color: '#8b5a3c',
                  border: '1px solid rgba(210, 105, 30, 0.2)'
                }}>
                  {/* Friend Requests Section */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#d2691e' }}>
                      Friend Requests ({pendingRequests.length})
                    </h4>
                    
                    {pendingRequests.length === 0 ? (
                      <div style={{ fontSize: '0.9rem', color: '#a0785a', padding: '0.8rem', textAlign: 'center' }}>
                        No pending requests
                      </div>
                    ) : (
                      pendingRequests.map(request => (
                        <div key={request.id} style={{
                          background: 'rgba(218, 165, 32, 0.1)',
                          border: '1px solid rgba(218, 165, 32, 0.3)',
                          borderRadius: '16px',
                          padding: '1rem',
                          marginBottom: '0.8rem'
                        }}>
                          <div style={{ fontWeight: '500', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                            {request.sender?.username || 'Unknown User'}
                          </div>
                          {request.message && (
                            <div style={{ fontSize: '0.85rem', color: '#a0785a', marginBottom: '0.8rem' }}>
                              "{request.message}"
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '0.8rem' }}>
                            <button
                              onClick={() => respondToFriendRequest(request.id, 'accepted')}
                              style={{
                                background: 'linear-gradient(135deg, #28a745, #20c997)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                padding: '0.5rem 1rem',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                fontWeight: '500'
                              }}
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => respondToFriendRequest(request.id, 'declined')}
                              style={{
                                background: 'rgba(220, 53, 69, 0.1)',
                                color: '#dc3545',
                                border: '1px solid rgba(220, 53, 69, 0.3)',
                                borderRadius: '12px',
                                padding: '0.5rem 1rem',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                fontWeight: '500'
                              }}
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Wallet Input Component */}
                  <WalletInput 
                    onWalletSave={handleWalletSave}
                    currentWallet={profile?.wallet_address}
                  />
                  
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%',
                      padding: '1rem',
                      backgroundColor: 'rgba(220, 53, 69, 0.1)',
                      color: '#dc3545',
                      border: '1px solid rgba(220, 53, 69, 0.3)',
                      borderRadius: '16px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      fontSize: '1rem',
                      marginTop: '1rem'
                    }}
                  >
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main title */}
          <div style={{
            background: 'linear-gradient(135deg, #d2691e, #cd853f, #daa520)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontSize: 'clamp(2.5rem, 6vw, 4rem)',
            fontWeight: '400',
            marginBottom: '2rem',
            letterSpacing: '-0.02em'
          }}>
            hanglight
          </div>

          {/* Status Light Picker - New Design */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '2rem',
              marginBottom: '2rem'
            }}>
              {['red', 'yellow', 'green'].map(status => (
                <button
                  key={status}
                  onClick={() => updateStatusLight(status)}
                  disabled={isUpdatingStatus}
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    border: profile?.status_light === status ? '3px solid #d2691e' : '2px solid rgba(139, 90, 60, 0.3)',
                    backgroundColor: getStatusColor(status),
                    cursor: 'pointer',
                    opacity: profile?.status_light === status ? 1 : 0.3,
                    boxShadow: profile?.status_light === status ? '0 0 25px rgba(210, 105, 30, 0.4)' : 'none',
                    transition: 'all 0.3s ease',
                    transform: profile?.status_light === status ? 'scale(1.1)' : 'scale(1)'
                  }}
                />
              ))}
            </div>
            
            {/* Status message input */}
            <div style={{ marginTop: '2rem' }}>
              <input
                type="text"
                value={statusMessage}
                onChange={(e) => setStatusMessage(e.target.value)}
                onBlur={() => updateStatusMessage(statusMessage)}
                placeholder="What are you up to?"
                style={{
                  width: '100%',
                  maxWidth: '400px',
                  padding: '1rem',
                  fontSize: '1rem',
                  border: '1px solid rgba(210, 105, 30, 0.3)',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.8)',
                  color: '#8b5a3c',
                  textAlign: 'center',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Friends Section */}
          <div>
            {/* Friends Header with Controls */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '2rem'
            }}>
              <button
                onClick={() => setShowAddFriend(true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(210, 105, 30, 0.2)',
                  borderRadius: '50%',
                  width: '50px',
                  height: '50px',
                  fontSize: '1.8rem',
                  cursor: 'pointer',
                  color: '#d2691e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '300'
                }}
              >
                +
              </button>

              <button
                onClick={() => loadFriends()}
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(210, 105, 30, 0.2)',
                  borderRadius: '50%',
                  width: '50px',
                  height: '50px',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#d2691e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ↻
              </button>
            </div>
            
            {/* Friends List - Updated with nickname functionality */}
            {friends.length > 0 ? (
              friends.map(friend => (
                <div key={friend.friend_id} style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  borderRadius: '20px',
                  padding: '1.5rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid rgba(210, 105, 30, 0.1)',
                  boxShadow: '0 2px 15px rgba(139, 90, 60, 0.08)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: getStatusColor(friend.status_light),
                        boxShadow: '0 0 8px rgba(0,0,0,0.2)',
                        flexShrink: 0
                      }}
                    />
                    <div style={{ textAlign: 'left', flex: 1 }}>
                      {/* Nickname editing functionality */}
                      {editingNickname === friend.friendship_id ? (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={nicknameInput}
                            onChange={(e) => setNicknameInput(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                updateNickname(friend.friendship_id, nicknameInput)
                              }
                            }}
                            style={{
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.9rem',
                              border: '1px solid rgba(210, 105, 30, 0.3)',
                              borderRadius: '8px',
                              background: 'rgba(255, 255, 255, 0.9)',
                              color: '#8b5a3c',
                              outline: 'none',
                              width: '150px'
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => updateNickname(friend.friendship_id, nicknameInput)}
                            style={{
                              background: 'linear-gradient(135deg, #28a745, #20c997)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              fontWeight: '500'
                            }}
                          >
                            ✓
                          </button>
                          <button
                            onClick={cancelEditingNickname}
                            style={{
                              background: 'rgba(220, 53, 69, 0.1)',
                              color: '#dc3545',
                              border: '1px solid rgba(220, 53, 69, 0.3)',
                              borderRadius: '6px',
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              fontWeight: '500'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div 
                          onClick={() => startEditingNickname(friend)}
                          style={{ 
                            fontWeight: '500', 
                            color: '#8b5a3c',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                        >
                          {friend.nickname || friend.username}
                          {friend.nickname && (
                            <span style={{ 
                              fontSize: '0.8rem', 
                              color: '#a0785a',
                              fontWeight: '400'
                            }}>
                              (@{friend.username})
                            </span>
                          )}
                          <span style={{ 
                            fontSize: '0.7rem', 
                            color: '#c4a373',
                            opacity: 0.6
                          }}>
                            ✏️
                          </span>
                        </div>
                      )}
                      
                      {/* Only show status message if it exists and is not empty */}
                      {friend.status_message && friend.status_message.trim() && (
                        <div style={{ fontSize: '0.9rem', color: '#a0785a' }}>
                          {friend.status_message}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#c4a373', flexShrink: 0 }}>
                    {formatTimeAgo(friend.last_status_update)}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ 
                textAlign: 'center', 
                color: '#a0785a', 
                fontSize: '1rem',
                marginTop: '1rem'
              }}>
                No friends yet. Add some friends to see their status!
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '1.5rem',
            fontSize: '0.8rem',
            color: '#c4a373',
            fontFamily: 'monospace'
          }}>
            grail // antisocial media MMXXV
          </div>

          {/* Donate Button - Floating bottom right */}
          <div style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 1000
          }}>
            <a
              href="https://www.paypal.com/ncp/payment/LEWS26K7J8FAC"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'linear-gradient(135deg, #0070ba, #003087)',
                color: 'white',
                padding: '0.8rem 1.2rem',
                borderRadius: '25px',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: '500',
                boxShadow: '0 4px 15px rgba(0, 112, 186, 0.3)',
                transition: 'all 0.3s ease',
                border: 'none'
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-2px)'
                e.target.style.boxShadow = '0 6px 20px rgba(0, 112, 186, 0.4)'
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0px)'
                e.target.style.boxShadow = '0 4px 15px rgba(0, 112, 186, 0.3)'
              }}
            >
              <span>donate 🕊</span>
            </a>
          </div>
        </div>

        {/* Message display for nickname updates */}
        {message && message.includes('Nickname') && (
          <div style={{
            position: 'fixed',
            top: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(40, 167, 69, 0.9)',
            color: 'white',
            padding: '1rem 2rem',
            borderRadius: '16px',
            fontSize: '0.9rem',
            fontWeight: '500',
            zIndex: 2000,
            boxShadow: '0 4px 20px rgba(40, 167, 69, 0.3)'
          }}>
            {message}
          </div>
        )}
      </div>
    )
  }

  // Login/Register Screen
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f1e8',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.8)',
        borderRadius: '24px',
        padding: '3rem 2rem',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center',
        boxShadow: '0 8px 30px rgba(139, 90, 60, 0.15)',
        color: '#8b5a3c',
        border: '1px solid rgba(210, 105, 30, 0.2)'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #d2691e, #cd853f, #daa520)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontSize: '3rem',
          fontWeight: '400',
          margin: '0 0 0.5rem 0'
        }}>
          hanglight
        </div>
        <p style={{ color: '#a0785a', margin: '0 0 3rem 0', letterSpacing: '0.2em', fontSize: '0.9rem' }}>
          antisocial media
        </p>

        <div style={{ 
          display: 'flex', 
          marginBottom: '2rem', 
          borderRadius: '16px', 
          overflow: 'hidden',
          background: 'rgba(210, 105, 30, 0.1)',
          border: '1px solid rgba(210, 105, 30, 0.2)'
        }}>
          <button
            onClick={() => setActiveTab('login')}
            style={{
              flex: 1,
              padding: '1rem',
              backgroundColor: activeTab === 'login' ? 'linear-gradient(135deg, #d2691e, #cd853f)' : 'transparent',
              background: activeTab === 'login' ? 'linear-gradient(135deg, #d2691e, #cd853f)' : 'transparent',
              color: activeTab === 'login' ? 'white' : '#8b5a3c',
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
              backgroundColor: activeTab === 'register' ? 'linear-gradient(135deg, #d2691e, #cd853f)' : 'transparent',
              background: activeTab === 'register' ? 'linear-gradient(135deg, #d2691e, #cd853f)' : 'transparent',
              color: activeTab === 'register' ? 'white' : '#8b5a3c',
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
            borderRadius: '16px',
            marginBottom: '1.5rem',
            backgroundColor: message.includes('successful') || message.includes('Welcome') ? 'rgba(40, 167, 69, 0.1)' : 
                           message.includes('failed') ? 'rgba(220, 53, 69, 0.1)' : 'rgba(218, 165, 32, 0.1)',
            color: message.includes('successful') || message.includes('Welcome') ? '#28a745' : 
                   message.includes('failed') ? '#dc3545' : '#d2691e',
            fontSize: '0.9rem',
            border: `1px solid ${message.includes('successful') || message.includes('Welcome') ? 'rgba(40, 167, 69, 0.3)' : 
                           message.includes('failed') ? 'rgba(220, 53, 69, 0.3)' : 'rgba(218, 165, 32, 0.3)'}`
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
            padding: '1.2rem',
            border: '1px solid rgba(210, 105, 30, 0.3)',
            borderRadius: '16px',
            marginBottom: '1rem',
            boxSizing: 'border-box',
            fontSize: '1rem',
            outline: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            color: '#8b5a3c'
          }}
        />

        <input
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          placeholder="Password"
          style={{
            width: '100%',
            padding: '1.2rem',
            border: '1px solid rgba(210, 105, 30, 0.3)',
            borderRadius: '16px',
            marginBottom: '1rem',
            boxSizing: 'border-box',
            fontSize: '1rem',
            outline: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            color: '#8b5a3c'
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
              padding: '1.2rem',
              border: '1px solid rgba(210, 105, 30, 0.3)',
              borderRadius: '16px',
              marginBottom: '1rem',
              boxSizing: 'border-box',
              fontSize: '1rem',
              outline: 'none',
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              color: '#8b5a3c'
            }}
          />
        )}

        <button 
          onClick={activeTab === 'login' ? handleLogin : handleRegister}
          disabled={loading || !supabase}
          style={{
            width: '100%',
            padding: '1.2rem',
            background: 'linear-gradient(135deg, #d2691e, #cd853f)',
            color: 'white',
            border: 'none',
            borderRadius: '16px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '1rem',
            opacity: (loading || !supabase) ? 0.5 : 1,
            boxShadow: '0 4px 20px rgba(210, 105, 30, 0.3)'
          }}
        >
          {loading ? 'Loading...' : (activeTab === 'login' ? 'Login' : 'Register')}
        </button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<HanglightApp />)
