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
    identifier: '', // email or username
    message: ''
  })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [statusMessage, setStatusMessage] = useState(
