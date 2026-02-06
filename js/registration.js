import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// Supabase configuration
const SUPABASE_URL = 'https://dtcwvzjicjdywqkghaip.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0Y3d2emppY2pkeXdxa2doYWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwODczODgsImV4cCI6MjA4NTY2MzM4OH0.S_kJESfs6OplIQD25BtZ2AFSlUqc6w-32_FfpZT-X3A'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// DOM elements
const registrationForm = document.getElementById('registrationForm')
const successMessage = document.getElementById('regSuccessMsg')
const errorMessage = document.getElementById('regErrorMsg')
const submitButton = document.getElementById('submitRegBtn')
const formContainer = document.querySelector('.registration-glass-container')
const successContainer = document.getElementById('successContainer')
const sectionHeader = document.querySelector('#registration .section-header')

// Get form fields (UPDATED: support both old IDs and new IDs)
const fullNameField =
  document.getElementById('reg_full_name') || document.getElementById('regfullname')
const emailField = document.getElementById('reg_email') || document.getElementById('regemail')
const phoneField = document.getElementById('reg_phone') || document.getElementById('regphone')
const institutionField =
  document.getElementById('reg_institution') || document.getElementById('reginstitution')

// If the form isn't on the page, do nothing (prevents console errors)
if (!registrationForm || !submitButton) {
  // no-op
} else {
  // Create error display elements for real-time validation
  const emailErrorDiv = emailField ? createErrorElement('emailValidationError') : null
  const phoneErrorDiv = phoneField ? createErrorElement('phoneValidationError') : null

  // Insert error divs after input fields
  if (emailField && emailErrorDiv) emailField.parentNode.appendChild(emailErrorDiv)
  if (phoneField && phoneErrorDiv) phoneField.parentNode.appendChild(phoneErrorDiv)

  // Attach real-time validation to input fields
  if (emailField && emailErrorDiv) {
    emailField.addEventListener(
      'input',
      debounce((e) => {
        const email = e.target.value
        if (!email || email.trim() === '') return hideError(emailErrorDiv)
        const errors = getEmailErrors(email)
        if (errors.length > 0) showError(emailErrorDiv, errors[0])
        else hideError(emailErrorDiv)
      }, 500)
    )
  }

  if (phoneField && phoneErrorDiv) {
    phoneField.addEventListener(
      'input',
      debounce((e) => {
        // Allow only digits (UPDATED: regex literal should use \d, not \\d)
        e.target.value = e.target.value.replace(/[^\d]/g, '')
        const phone = e.target.value
        if (!phone || phone.trim() === '') return hideError(phoneErrorDiv)
        const errors = getPhoneErrors(phone)
        if (errors.length > 0) showError(phoneErrorDiv, errors[0])
        else hideError(phoneErrorDiv)
      }, 500)
    )
  }

  /**
   * Handle form submission
   */
  registrationForm.addEventListener('submit', async (e) => {
    e.preventDefault()

    // Disable submit button to prevent double submission
    submitButton.disabled = true
    const btnText = submitButton.querySelector('.btn-text')
    const btnLoader = submitButton.querySelector('.btn-loader')
    if (btnText) btnText.style.display = 'none'
    if (btnLoader) btnLoader.style.display = 'inline'

    // Hide previous messages
    if (errorMessage) errorMessage.style.display = 'none'
    if (successMessage) successMessage.style.display = 'none'
    if (emailErrorDiv) hideError(emailErrorDiv)
    if (phoneErrorDiv) hideError(phoneErrorDiv)

    // Collect form data (✅ topic removed)
    const formData = {
      full_name: (fullNameField?.value || '').trim(),
      email: (emailField?.value || '').trim(),
      phone: (phoneField?.value || '').trim(),
      institution: (institutionField?.value || '').trim(),
    }

    try {
      // STEP 1: Client-side validation (✅ no topic validation)
      const validation = validateRegistrationForm(formData)

      if (!validation.valid) {
        // Show field-level errors (if those elements exist)
        if (validation.errors.email && emailErrorDiv) showError(emailErrorDiv, validation.errors.email)
        if (validation.errors.phone && phoneErrorDiv) showError(phoneErrorDiv, validation.errors.phone)

        const firstError = Object.values(validation.errors)[0] || 'Please check your information.'
        showMainError(firstError)

        throw new Error('VALIDATION_ERROR')
      }

      // STEP 2: Call Edge Function (payload has no topic)
      const response = await supabase.functions.invoke('send-confirmation-email', {
        body: formData,
      })

      // STEP 3: Handle Response
      if (response.error) {
        const errorMsg = extractErrorMessage(response)
        showMainError(errorMsg)
        throw new Error(errorMsg)
      }

      if (!response.data) {
        showMainError('No response from server. Please try again.')
        throw new Error('Empty response from server')
      }

      const result = response.data
      if (result.success === false) {
        let errorMsg = 'Registration failed. Please check your information.'
        if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
          errorMsg = result.errors.length === 1 ? result.errors[0] : '• ' + result.errors.join('\n• ')
        } else if (result.error) {
          errorMsg = result.error
        } else if (result.message) {
          errorMsg = result.message
        }
        showMainError(errorMsg)
        throw new Error(errorMsg)
      }

      // SUCCESS UI
      if (formContainer) formContainer.style.display = 'none'
      if (sectionHeader) sectionHeader.style.display = 'none'
      if (successContainer) {
        successContainer.style.display = 'block'
        setTimeout(() => {
          successContainer.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }
    } catch (error) {
      // Only show error if not already shown and not validation error
      if (errorMessage?.style?.display === 'none' && error?.message !== 'VALIDATION_ERROR') {
        showMainError(error?.message || 'Something went wrong. Please try again.')
      }

      // Re-enable submit button
      submitButton.disabled = false
      if (btnText) btnText.style.display = 'inline'
      if (btnLoader) btnLoader.style.display = 'none'
    }
  })
}

/* =========================
   Helpers (self-contained)
   ========================= */

function createErrorElement(id) {
  const div = document.createElement('div')
  div.id = id
  div.style.cssText =
    'display:none; color:#ef4444; font-size:0.875rem; margin-top:0.5rem; font-weight:500;'
  return div
}

function showError(element, message) {
  element.textContent = message
  element.style.display = 'block'
}

function hideError(element) {
  element.style.display = 'none'
}

function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

function isValidEmail(email) {
  // UPDATED: regex literal should use \s and \. (not \\s and \\.)
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i
  return re.test(String(email).trim())
}

function isValidPhoneBD(phone) {
  const p = String(phone).trim()
  // UPDATED: regex literal should use \d (not \\d)
  if (!/^\d+$/.test(p)) return false
  if (p.length !== 11) return false
  if (!p.startsWith('01')) return false
  return true
}

function getEmailErrors(email) {
  const errors = []
  if (!email || email.trim() === '') return ['Email is required']
  if (!isValidEmail(email)) errors.push('Invalid email format')
  return errors
}

function getPhoneErrors(phone) {
  const errors = []
  const p = String(phone).trim()
  if (!p) return ['Phone number is required']
  // UPDATED: regex literal should use \d (not \\d)
  if (!/^\d+$/.test(p)) return ['Phone number must contain only digits']
  if (p.length !== 11) errors.push('Phone number must be exactly 11 digits')
  if (!p.startsWith('01')) errors.push('Phone number must start with 01')
  return errors
}

function validateRegistrationForm(formData) {
  const errors = {}

  // full name
  if (!formData.full_name || formData.full_name.trim().length < 3) {
    errors.full_name = 'Full name must be at least 3 characters'
  }

  // email
  const emailErrors = getEmailErrors(formData.email)
  if (emailErrors.length) errors.email = emailErrors[0]

  // phone
  const phoneErrors = getPhoneErrors(formData.phone)
  if (phoneErrors.length) errors.phone = phoneErrors[0]
  else if (!isValidPhoneBD(formData.phone)) errors.phone = 'Invalid phone number'

  // institution
  if (!formData.institution || formData.institution.trim().length < 2) {
    errors.institution = 'Institution is required'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

function showMainError(message) {
  const errorText = document.getElementById('errorText')
  if (errorText) errorText.textContent = message

  const errorMessage = document.getElementById('regErrorMsg')
  const successMessage = document.getElementById('regSuccessMsg')

  if (errorMessage) errorMessage.style.display = 'flex'
  if (successMessage) successMessage.style.display = 'none'

  if (errorMessage?.scrollIntoView) {
    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  setTimeout(() => {
    if (errorMessage) errorMessage.style.display = 'none'
  }, 10000)
}

function extractErrorMessage(response) {
  let errorMsg = 'Registration failed. Please try again.'

  if (!response?.error) return errorMsg

  // METHOD 1: error.context.body
  if (response.error.context && response.error.context.body) {
    try {
      const errorBody =
        typeof response.error.context.body === 'string'
          ? JSON.parse(response.error.context.body)
          : response.error.context.body

      if (errorBody?.errors && Array.isArray(errorBody.errors) && errorBody.errors.length > 0) {
        return errorBody.errors.length === 1 ? errorBody.errors[0] : '• ' + errorBody.errors.join('\n• ')
      }
      if (typeof errorBody?.error === 'string') return errorBody.error
      if (typeof errorBody?.message === 'string') return errorBody.message
    } catch {
      // ignore parse errors
    }
  }

  // METHOD 2: direct error.message (ignore generic)
  if (response.error.message) {
    const msg = response.error.message
    if (
      !msg.includes('non-2xx') &&
      !msg.includes('FunctionsHttpError') &&
      !msg.includes('FunctionsRelayError')
    ) {
      return msg
    }
  }

  return errorMsg
}
