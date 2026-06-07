# UI Patterns

Copy-paste snippets that follow this project's conventions. Adapt class names and tokens as needed.

## Buttons

```tsx
<button className="btn btn-primary" disabled={status === 'sending'}>
  {status === 'sending' ? 'Sending…' : 'Send'}
</button>

<button className="btn btn-ghost" onClick={onCancel}>
  Cancel
</button>
```

## Form Field

```tsx
<form className="compose-form" onSubmit={handleSubmit}>
  <label>
    Email
    <input
      type="email"
      required
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      placeholder="name@example.com"
    />
  </label>
  <div className="compose-actions">
    <button type="submit" className="btn btn-primary">
      Save
    </button>
    {status === "sent" && <span className="success">Saved ✓</span>}
    {error && <span className="error">{error}</span>}
  </div>
</form>
```

## Clickable Card Row

```tsx
<ul className="message-list">
  {items.map((item) => (
    <Link key={item.id} to={`/app/${item.id}`} className="message-row">
      <span className="message-from">{item.from}</span>
      <span className="message-subject">{item.subject}</span>
      <span className="message-snippet">{item.snippet}</span>
    </Link>
  ))}
</ul>
```

## Status Text

```tsx
<span className="muted">No messages yet</span>
<span className="success">Sent ✓</span>
<span className="error">{error}</span>
```

## Adding a New Token

In `src/index.css`, add to `:root`, then reference it:

```css
:root {
  --warning: #f5a623;
}

.warning {
  color: var(--warning);
}
```
