//test for checking if xss() sanitiser strips it before writing to posts json and db
const express = require('express');
const xss = require('xss');
const { expect } = require('chai');

describe('XSS sanitisation', () => {
    it('removes script tags from post title', () => {
        const input = '<script>alert("xss")</script>Hello';
        // console.log(input)
        const result = xss(input);
        // console.log(result)
        expect(result).to.not.include('<script>')
    });
    it('removes script tags from post content', () => {
        const input = 'Normal text <img src=x onerror=alert(1)';
        // console.log(input)
        const result = xss(input);
        // console.log(result)
        expect(result).to.not.include('onerror')
    });
    it('check clean input unchanged', () => {
        const input = 'Hello this is a post';
        // console.log(input)
        const result = xss(input);
        // console.log(result)
        expect(result).to.equal(input)
    })
})
